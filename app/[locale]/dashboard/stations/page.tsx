import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StationHealthMapClient from './StationHealthMapClient'

export default async function StationHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: stations } = await supabase
    .from('station_health')
    .select('station_id, name, kind, district_id, status, battery_voltage, last_transmission_at, rssi')
    .order('name')

  const total = stations?.length ?? 0
  const offlineCount = stations?.filter((s) => s.status === 'offline').length ?? 0
  const reportingCount = total - offlineCount
  const lowBatteryCount =
    stations?.filter((s) => s.battery_voltage != null && s.battery_voltage < 11.0).length ?? 0

  function batteryPercent(v: number | null) {
    if (v == null) return 0
    const pct = ((v - 9.0) / (12.6 - 9.0)) * 100
    return Math.max(0, Math.min(100, Math.round(pct)))
  }

  function statusBadgeClass(status: string) {
    if (status === 'online') return 'bg-[var(--color-primary-hover)]/15 text-[var(--color-primary-hover)]'
    if (status === 'degraded') return 'bg-[#E0A030]/15 text-[#E0A030]'
    return 'bg-[var(--color-emergency)]/15 text-[var(--color-emergency)]'
  }

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <a href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </a>
        <h1 className="mt-1 text-xl font-semibold text-white">Station Health</h1>
        <p className="text-sm text-white/70">{reportingCount}/{total} Reporting</p>
      </header>

      <div className="grid grid-cols-3 gap-4 p-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs uppercase text-[var(--color-ink)]/50">Reporting</p>
          <p className="text-2xl font-semibold">{reportingCount}/{total}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs uppercase text-[var(--color-ink)]/50">Offline</p>
          <p className="text-2xl font-semibold text-[var(--color-emergency)]">{offlineCount}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs uppercase text-[var(--color-ink)]/50">Low Battery</p>
          <p className="text-2xl font-semibold text-[#E0A030]">{lowBatteryCount}</p>
        </div>
      </div>

      <div className="mx-6 h-[420px] overflow-hidden rounded-lg border border-[var(--color-border)]">
        <StationHealthMapClient />
      </div>

      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-base)] text-left text-xs uppercase text-[var(--color-ink)]/50">
              <tr>
                <th className="px-4 py-2">Station</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Battery</th>
                <th className="px-4 py-2">Last Transmission</th>
              </tr>
            </thead>
            <tbody>
              {(stations ?? []).map((s) => (
                <tr key={s.station_id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-mono uppercase ${statusBadgeClass(s.status)}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-24 rounded-full bg-[var(--color-border)]">
                      <div
                        className="h-2 rounded-full bg-[var(--color-primary-hover)]"
                        style={{ width: `${batteryPercent(s.battery_voltage)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-[var(--color-ink)]/60">
                    {s.last_transmission_at
                      ? new Date(s.last_transmission_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })
                      : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}