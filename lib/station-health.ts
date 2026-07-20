export type StationStatus = 'online' | 'degraded' | 'offline'

export interface StationHealthRow {
  station_id: string
  name: string
  kind: string
  valley: string | null
  district_id: string | null
  district_name: string | null
  source: string
  is_simulated: boolean
  status: StationStatus
  battery_voltage: number | null
  last_transmission_at: string | null
  rssi: number | null
}

export function batteryPercent(v: number | null): number {
  if (v == null) return 0
  const pct = ((v - 9.0) / (12.6 - 9.0)) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

export function hoursSince(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

export function isOfflineOverHours(iso: string | null, hours: number): boolean {
  const h = hoursSince(iso)
  if (h == null) return true
  return h > hours
}

export function statusBadgeClass(status: string): string {
  if (status === 'online') return 'bg-[var(--color-primary-hover)]/15 text-[var(--color-primary-hover)]'
  if (status === 'degraded') return 'bg-[#E0A030]/15 text-[#E0A030]'
  return 'bg-[var(--color-emergency)]/15 text-[var(--color-emergency)]'
}

export function formatPkt(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface RollupStats {
  total: number
  reporting: number
  reportingPct: number
  lowBattery: number
  offline72h: number
  openTickets: number
}

export function computeRollup(
  stations: StationHealthRow[],
  openTicketCount: number
): RollupStats {
  const total = stations.length
  const reporting = stations.filter((s) => s.status !== 'offline').length
  const lowBattery = stations.filter(
    (s) => s.battery_voltage != null && s.battery_voltage < 11.0
  ).length
  const offline72h = stations.filter((s) => isOfflineOverHours(s.last_transmission_at, 72)).length

  return {
    total,
    reporting,
    reportingPct: total > 0 ? Math.round((reporting / total) * 100) : 0,
    lowBattery,
    offline72h,
    openTickets: openTicketCount,
  }
}

export interface GroupBreakdown {
  label: string
  total: number
  reporting: number
  offline: number
  lowBattery: number
}

export function groupBreakdown(
  stations: StationHealthRow[],
  key: (s: StationHealthRow) => string
): GroupBreakdown[] {
  const map = new Map<string, StationHealthRow[]>()
  for (const s of stations) {
    const k = key(s) || 'Unknown'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(s)
  }

  return Array.from(map.entries())
    .map(([label, items]) => ({
      label,
      total: items.length,
      reporting: items.filter((i) => i.status !== 'offline').length,
      offline: items.filter((i) => i.status === 'offline').length,
      lowBattery: items.filter(
        (i) => i.battery_voltage != null && i.battery_voltage < 11.0
      ).length,
    }))
    .sort((a, b) => b.total - a.total)
}

/** Build 24 hourly transmission counts ending at the current hour (UTC buckets). */
export function bucketHourlyCounts(
  readings: { station_id: string; recorded_at: string }[]
): Record<string, number[]> {
  const now = new Date()
  const result: Record<string, number[]> = {}

  for (const r of readings) {
    if (!result[r.station_id]) result[r.station_id] = Array(24).fill(0)
    const ageMs = now.getTime() - new Date(r.recorded_at).getTime()
    const hoursAgo = Math.floor(ageMs / (1000 * 60 * 60))
    if (hoursAgo >= 0 && hoursAgo < 24) {
      result[r.station_id][23 - hoursAgo] += 1
    }
  }

  return result
}
