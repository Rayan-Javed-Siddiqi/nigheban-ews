import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ManualEntryForm from './ManualEntryForm'

type HazardRow = {
  id: string
  title: string
  severity: string
  starts_at: string | null
}

export default async function DistrictConsolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: district } = await supabase
    .from('district')
    .select('id, name_en, province, adm2_code, population')
    .eq('id', id)
    .single()
  if (!district) notFound()

  const [
  { data: weather },
  { data: manualReadings },
  { data: ingestStatus },
  { data: contacts },
  { data: advisories },
  { data: hazards },
] = await Promise.all([
  supabase.from('weather_reading').select('*').eq('district_id', id).maybeSingle(),
  supabase.from('manual_reading').select('*').eq('district_id', id).order('entered_at', { ascending: false }).limit(10),
  supabase.from('ingest_status').select('source, status, last_success_at').order('source'),
  supabase.from('district_contact').select('*').eq('district_id', id),
  supabase.from('advisory').select('*').eq('district_id', id).order('issued_at', { ascending: false }),
  supabase.rpc('get_district_hazards', { p_district_id: id, p_limit: 20 }) as unknown as Promise<{
      data: HazardRow[] | null
      error: unknown
    }>,
])

  const now = Date.now()
  const activeHazards = (hazards ?? []).filter(
    (h: HazardRow) => h.starts_at && now - new Date(h.starts_at).getTime() < 1000 * 60 * 60 * 24 * 3
  )
  const historicalHazards = (hazards ?? []).filter((h: HazardRow) => !activeHazards.includes(h))

  const sectionClass = "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
  const headingClass = "mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60"

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">{district.name_en}</h1>
        <p className="text-sm text-white/70">
          {district.province} · {district.adm2_code}
          {district.population ? ` · Pop. ${district.population.toLocaleString()}` : ''}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">

        {/* 1. Weather strip */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Weather</h2>
          {weather ? (
            <div className="grid grid-cols-3 gap-4 font-mono text-sm">
              <div>
                <p className="text-xs text-[var(--color-ink)]/50">Temp</p>
                <p className="text-lg">{weather.temperature ?? '—'}°C</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink)]/50">Precip</p>
                <p className="text-lg">{weather.precipitation ?? '—'}mm</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink)]/50">Snowfall</p>
                <p className="text-lg">{weather.snowfall ?? '—'}cm</p>
              </div>
              <p className="col-span-3 text-xs text-[var(--color-ink)]/40">
                Updated {new Date(weather.fetched_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No weather data yet for this district.</p>
          )}
        </section>

        {/* 2. District gauges (manual readings) */}
        <section className={sectionClass}>
          <h2 className={headingClass}>District Gauges</h2>
          {manualReadings && manualReadings.length > 0 ? (
            <div className="space-y-1">
              {manualReadings.map((r) => (
                <div key={r.id} className="font-mono text-xs text-[var(--color-ink)]/70">
                  {r.station_name} — {r.reading_type}: {r.value} {r.unit}
                  <span className="ml-2 text-[var(--color-ink)]/40">
                    ({new Date(r.entered_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No gauge readings recorded yet.</p>
          )}
        </section>

        {/* 3. Active hazards */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Active Hazards</h2>
          {activeHazards.length > 0 ? (
            <div className="space-y-2">
              {activeHazards.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span>{h.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-mono uppercase ${
                      h.severity === 'emergency' ? 'bg-[var(--color-emergency)]/15 text-[var(--color-emergency)]' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    }`}
                  >
                    {h.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No active hazards within 50km.</p>
          )}
        </section>

        {/* 4. Hazard history */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Hazard History</h2>
          {historicalHazards.length > 0 ? (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {historicalHazards.map((h) => (
                <div key={h.id} className="font-mono text-xs text-[var(--color-ink)]/60">
                  {h.title} — {h.starts_at ? new Date(h.starts_at).toLocaleDateString('en-GB') : 'unknown date'}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No historical hazard records nearby.</p>
          )}
        </section>

        {/* 5. District contacts */}
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
                        Demo Data
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No contacts on file yet.</p>
          )}
        </section>

        {/* 6. Latest advisories */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Latest Advisories</h2>
          {advisories && advisories.length > 0 ? (
            <div className="space-y-3">
              {advisories.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="font-medium">
                    {a.title}
                    {a.is_demo_data && (
                      <span className="ml-2 rounded bg-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-ink)]/50">
                        Demo Data
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-ink)]/60">{a.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No advisories issued.</p>
          )}
        </section>

        {/* Source health */}
        <section className={sectionClass}>
          <h2 className={headingClass}>Data Source Health</h2>
          <div className="space-y-2">
            {ingestStatus?.map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="font-mono">{s.source}</span>
                <span className="flex items-center gap-2 text-[var(--color-ink)]/60">
                  <span className={`h-2 w-2 rounded-full ${s.status === 'ok' ? 'bg-[var(--color-primary-hover)]' : 'bg-[var(--color-emergency)]'}`} />
                  {s.last_success_at ? new Date(s.last_success_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' }) : 'never'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* PMD manual entry */}
        <section className={sectionClass}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">PMD Manual Entry</h2>
          <p className="mb-3 text-xs text-[var(--color-ink)]/50">
            Automated PMD scraping is pending — enter bulletin readings manually until resolved.
          </p>
          <ManualEntryForm districtId={district.id} />
        </section>
      </div>
    </div>
  )
}