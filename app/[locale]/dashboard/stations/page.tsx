import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StationHealthMapClient from './StationHealthMapClient'
import StationHealthRollup from './StationHealthRollup'
import StationHealthClient from './StationHealthClient'
import type { StationHealthRow } from '@/lib/station-health'

export default async function StationHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: healthRows }, { data: stationMeta }, { data: tickets }] = await Promise.all([
    supabase
      .from('station_health')
      .select(
        'station_id, name, kind, status, battery_voltage, last_transmission_at, rssi'
      )
      .order('name'),
    supabase
      .from('station')
      .select('id, valley, district_id, source, is_simulated, district:district_id(name_en)'),
    supabase
      .from('maintenance_ticket')
      .select('id, station_id, reason, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const metaById = new Map(
    (stationMeta ?? []).map((s) => [
      s.id,
      {
        valley: s.valley as string | null,
        district_id: s.district_id as string | null,
        district_name: (s.district as { name_en: string } | null)?.name_en ?? null,
        source: s.source as string,
        is_simulated: s.is_simulated as boolean,
      },
    ])
  )

  const stationRows: StationHealthRow[] = (healthRows ?? []).map((h) => {
    const meta = metaById.get(h.station_id)
    return {
      station_id: h.station_id,
      name: h.name,
      kind: h.kind,
      status: h.status as StationHealthRow['status'],
      battery_voltage: h.battery_voltage,
      last_transmission_at: h.last_transmission_at,
      rssi: h.rssi,
      valley: meta?.valley ?? null,
      district_id: meta?.district_id ?? null,
      district_name: meta?.district_name ?? null,
      source: meta?.source ?? 'unknown',
      is_simulated: meta?.is_simulated ?? false,
    }
  })
  const stationNameById = new Map(stationRows.map((s) => [s.station_id, s.name]))

  const ticketsWithNames = (tickets ?? []).map((t) => ({
    ...t,
    station_name: t.station_id ? stationNameById.get(t.station_id) : undefined,
  }))

  const openTicketCount = ticketsWithNames.filter((t) => t.status === 'open').length

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <a href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </a>
        <h1 className="mt-1 text-xl font-semibold text-white">Station Health</h1>
        <p className="text-sm text-white/70">
          GLOF-II field network · simulated + virtual gauges · maintenance auto-tickets at 24h offline
        </p>
      </header>

      <div className="space-y-6 p-6">
        <StationHealthRollup stations={stationRows} openTicketCount={openTicketCount} />

        <div className="h-[420px] overflow-hidden rounded-lg border border-[var(--color-border)]">
          <StationHealthMapClient />
        </div>

        <StationHealthClient stations={stationRows} tickets={ticketsWithNames} />
      </div>
    </div>
  )
}
