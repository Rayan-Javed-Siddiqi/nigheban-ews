import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ManualEntryForm from './ManualEntryForm'
import PmdFfdPanel from './PmdFfdPanel'
import { formatPkt, hazardIcon, riskLevelClass, severityBadgeClass } from '@/lib/hazard-console'
import { statusBadgeClass, formatPkt as formatPktStation } from '@/lib/station-health'

type HazardRow = {
  id: string
  hazard: string
  severity: string
  title: string
  starts_at: string | null
  source: string
}

export default async function DistrictConsolePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: district } = await supabase
    .from('district')
    .select('id, name_en, province, adm2_code, population')
    .eq('id', id)
    .single()
  if (!district) notFound()

  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: weather },
    { data: manualReadings },
    { data: ingestStatus },
    { data: contacts },
    { data: advisories },
    { data: hazards },
    { data: floodForecast },
    { data: droughtIndex },
    { data: activeAlerts },
    { data: pmdLatest, error: pmdError },
    { data: dbReservoirs, error: reservoirError },
    { data: districtStations },
  ] = await Promise.all([
    supabase.from('weather_reading').select('*').eq('district_id', id).maybeSingle(),
    supabase.from('manual_reading').select('*').eq('district_id', id).order('entered_at', { ascending: false }).limit(10),
    supabase.from('ingest_status').select('source, status, last_success_at').order('source'),
    supabase.from('district_contact').select('*').eq('district_id', id),
    supabase.from('advisory').select('*').or(`district_id.eq.${id},district_id.is.null`).order('issued_at', { ascending: false }).limit(10),
    supabase.rpc('get_district_hazards', { p_district_id: id, p_limit: 20 }) as unknown as Promise<{ data: HazardRow[] | null }>,
    supabase.from('flood_forecast').select('*').eq('district_id', id).gte('forecast_date', today).order('forecast_date').limit(7),
    supabase.from('drought_index').select('spi_3, date').eq('district_id', id).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('alert_candidate').select('id, title, severity, status, issued_at, event_en').eq('district_id', id).eq('status', 'issued').order('issued_at', { ascending: false }),
    supabase.from('pmd_forecasts').select('warning_level, forecast_text, rivers, fetched_at, bulletin_id, source_url, matched_by_date').order('fetched_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('reservoir_reading').select('*').order('reading_date', { ascending: false }).limit(3),
    supabase.from('station').select('id, name, kind, valley, source, is_simulated').eq('district_id', id).order('name'),
  ])

  const isMissingTable = (code?: string) => code === 'PGRST205' || code === '42P01'
  if (pmdError && !isMissingTable(pmdError.code)) {
    console.error('[district] pmd_forecasts:', pmdError.message)
  }
  if (reservoirError && !isMissingTable(reservoirError.code)) {
    console.error('[district] reservoir_reading:', reservoirError.message)
  }

  const pmd = pmdLatest
  const reservoirs = dbReservoirs ?? []

  const stationIds = (districtStations ?? []).map((s) => s.id)
  let stationHealth: { station_id: string; status: string; battery_voltage: number | null; last_transmission_at: string | null }[] = []
  if (stationIds.length > 0) {
    const { data } = await supabase
      .from('station_health')
      .select('station_id, status, battery_voltage, last_transmission_at')
      .in('station_id', stationIds)
    stationHealth = data ?? []
  }
  const healthByStation = new Map(stationHealth.map((h) => [h.station_id, h]))

  const now = Date.now()
  const activeHazards = (hazards ?? []).filter(
    (h) => h.starts_at && now - new Date(h.starts_at).getTime() < 1000 * 60 * 60 * 24 * 3
  )
  const historicalHazards = (hazards ?? []).filter((h) => !activeHazards.includes(h))

  const latestFlood = floodForecast?.[0]
  const sectionClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
  const headingClass = 'mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60'

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">{district.name_en}</h1>
        <p className="text-sm text-white/70">
          {district.province} · {district.adm2_code}
          {district.population ? ` · Pop. ${district.population.toLocaleString()}` : ''}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        {/* Weather strip */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Weather (Open-Meteo)</h2>
          {weather ? (
            <div className="grid grid-cols-3 gap-4 font-mono text-sm">
              <div>
                <p className="text-xs text-[var(--color-ink)]/50">Temp</p>
                <p className="text-lg">{weather.temperature ?? '—'}°C</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink)]/50">Precip</p>
                <p className="text-lg">{weather.precipitation ?? '—'} mm</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink)]/50">Snowfall</p>
                <p className="text-lg">{weather.snowfall ?? '—'} cm</p>
              </div>
              <p className="col-span-3 text-xs text-[var(--color-ink)]/40">
                Updated {formatPkt(weather.fetched_at)} PKT
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No weather data yet — run Open-Meteo ingest.</p>
          )}
        </section>

        {/* P2 MVP: official flood sources — gauge forecast · PMD FFD · NDMA */}
        <section className={`${sectionClass} md:col-span-2`}>
          <h2 className={headingClass}>Official Flood Intelligence (P2)</h2>
          <p className="mb-4 text-xs text-[var(--color-ink)]/50">
            Google/Open-Meteo model · PMD FFD credibility source · NDMA/PDMA advisories — side by side per MVP spec.
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded border border-[var(--color-border)] bg-white p-4">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink)]/40">
                Flood forecast (model)
              </h3>
              {latestFlood ? (
                <div className="space-y-1 text-sm">
                  <p>
                    Risk:{' '}
                    <span className={`font-mono font-semibold uppercase ${riskLevelClass(latestFlood.risk_level)}`}>
                      {latestFlood.risk_level}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/70">
                    Discharge: {latestFlood.river_discharge?.toFixed(1) ?? '—'} m³/s
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-ink)]/50">No district flood forecast — run Open-Meteo ingest.</p>
              )}
            </div>

            <div className="rounded border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4 lg:col-span-1">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
                PMD FFD (credibility source)
              </h3>
              <PmdFfdPanel districtName={district.name_en} pmd={pmd} />
            </div>

            <div className="rounded border border-[var(--color-border)] bg-white p-4">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink)]/40">
                NDMA / PDMA advisories
              </h3>
              {advisories && advisories.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {advisories.slice(0, 5).map((a) => (
                    <div key={a.id} className="text-xs">
                      <p className="font-medium">{a.title}</p>
                      <p className="line-clamp-3 text-[var(--color-ink)]/60">{a.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-ink)]/50">No advisories ingested.</p>
              )}
            </div>
          </div>
        </section>

        {/* Field stations */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Field Stations ({districtStations?.length ?? 0})</h2>
          {districtStations && districtStations.length > 0 ? (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {districtStations.map((s) => {
                const h = healthByStation.get(s.id)
                return (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p>{s.name}</p>
                      <p className="text-xs text-[var(--color-ink)]/50">
                        {s.valley ?? s.kind} · {s.is_simulated ? 'simulated' : s.source}
                      </p>
                    </div>
                    {h && (
                      <div className="text-right">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${statusBadgeClass(h.status)}`}>
                          {h.status}
                        </span>
                        <p className="mt-1 font-mono text-[10px] text-[var(--color-ink)]/40">
                          {formatPktStation(h.last_transmission_at)}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No stations registered in this district.</p>
          )}
        </section>

        {/* Active alerts */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Active Alerts</h2>
          {activeAlerts && activeAlerts.length > 0 ? (
            <div className="space-y-2">
              {activeAlerts.map((a) => (
                <Link
                  key={a.id}
                  href={`/${locale}/dashboard/alerts/${a.id}`}
                  className="flex items-center justify-between rounded border border-[var(--color-border)] p-2 text-sm hover:bg-[var(--color-base)]"
                >
                  <span>{a.event_en ?? a.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-mono uppercase ${severityBadgeClass(a.severity)}`}>
                    {a.severity}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No issued alerts for this district.</p>
          )}
        </section>

        {/* Active hazards */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Active Hazards (50 km)</h2>
          {activeHazards.length > 0 ? (
            <div className="space-y-2">
              {activeHazards.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span>{hazardIcon(h.hazard)} {h.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-mono uppercase ${severityBadgeClass(h.severity)}`}>
                    {h.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No active hazards within 50 km.</p>
          )}
        </section>

        {/* Hazard history */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Hazard History</h2>
          {historicalHazards.length > 0 ? (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {historicalHazards.map((h) => (
                <div key={h.id} className="font-mono text-xs text-[var(--color-ink)]/60">
                  {hazardIcon(h.hazard)} {h.title} — {h.starts_at ? formatPkt(h.starts_at) : 'unknown'}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No historical hazard records nearby.</p>
          )}
        </section>

        {droughtIndex && (
          <section className={sectionClass}>
            <h2 className={headingClass}>Drought SPI-3</h2>
            <p className="font-mono text-sm">
              {droughtIndex.spi_3} <span className="text-xs text-[var(--color-ink)]/50">({droughtIndex.date})</span>
            </p>
          </section>
        )}

        {/* IRSA reservoirs */}
        <section className={sectionClass}>
          <h2 className={headingClass}>IRSA Reservoir Status</h2>
          {reservoirs && reservoirs.length > 0 ? (
            <div className="space-y-2">
              {reservoirs.map((r, i) => (
                <div key={r.id ?? r.reservoir_name ?? i} className="rounded border border-[var(--color-border)] px-3 py-2">
                  <div className="flex justify-between font-mono text-sm">
                    <span className="font-semibold">{r.reservoir_name}</span>
                    <span className="text-[var(--color-ink)]/70">
                      {r.level_ft != null ? `${r.level_ft} ft` : '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-xs text-[var(--color-ink)]/50">
                    <span>In: {r.inflow_cusecs?.toLocaleString() ?? '—'} cusecs</span>
                    <span>Out: {r.outflow_cusecs?.toLocaleString() ?? '—'} cusecs</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-[var(--color-ink)]/40">
                Provincial reservoirs (Tarbela, Mangla, Chashma) · updated {formatPkt(reservoirs[0]?.fetched_at)} PKT
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">
              No IRSA reservoir data available — daily PDF may not be published yet.
            </p>
          )}
        </section>

        {/* Contacts */}
        <section className={sectionClass}>
          <h2 className={headingClass}>District Contacts</h2>
          {contacts && contacts.length > 0 ? (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="text-sm">
                  <p>{c.role_title}</p>
                  <p className="font-mono text-xs text-[var(--color-ink)]/50">
                    {c.phone_placeholder}
                    {c.is_demo_data && (
                      <span className="ml-2 rounded bg-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase">
                        Demo
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No contacts on file.</p>
          )}
        </section>

        {/* Advisories (full list) */}
        <section className={sectionClass}>
          <h2 className={headingClass}>All Advisories</h2>
          {advisories && advisories.length > 0 ? (
            <div className="max-h-48 space-y-3 overflow-y-auto">
              {advisories.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="font-medium">
                    <span className="text-[10px] uppercase text-[var(--color-ink)]/40">{a.source} · </span>
                    {a.title}
                  </p>
                  <p className="line-clamp-2 text-xs text-[var(--color-ink)]/60">{a.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No advisories.</p>
          )}
        </section>

        {/* Manual gauges + PMD entry */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Manual Gauge Readings</h2>
          {manualReadings && manualReadings.length > 0 ? (
            <div className="mb-4 space-y-1">
              {manualReadings.map((r) => (
                <div key={r.id} className="font-mono text-xs text-[var(--color-ink)]/70">
                  {r.station_name} — {r.reading_type}: {r.value} {r.unit}
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-[var(--color-ink)]/50">No manual readings.</p>
          )}
          <ManualEntryForm districtId={district.id} />
        </section>

        {/* Source health */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Data Source Health</h2>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {ingestStatus?.map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs">{s.source}</span>
                <span className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink)]/60">
                  <span className={`h-2 w-2 rounded-full ${s.status === 'ok' ? 'bg-[var(--color-primary-hover)]' : 'bg-[var(--color-emergency)]'}`} />
                  {s.last_success_at ? formatPkt(s.last_success_at) : 'never'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
