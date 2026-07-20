import { groupBreakdown, computeRollup, type StationHealthRow } from '@/lib/station-health'

interface StationHealthRollupProps {
  stations: StationHealthRow[]
  openTicketCount: number
}

export default function StationHealthRollup({ stations, openTicketCount }: StationHealthRollupProps) {
  const stats = computeRollup(stations, openTicketCount)
  const byValley = groupBreakdown(stations, (s) => s.valley ?? 'Unknown valley')
  const byDistrict = groupBreakdown(stations, (s) => s.district_name ?? 'Unknown district')

  return (
    <section className="space-y-4">
      {/* M2 headline roll-up */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <p className="font-mono text-sm text-[var(--color-ink)]">
          <span className="font-semibold text-[var(--color-primary-hover)]">
            {stats.reporting}/{stats.total}
          </span>
          {' stations reporting '}
          <span className="text-[var(--color-ink)]/60">({stats.reportingPct}%)</span>
          <span className="mx-2 text-[var(--color-ink)]/30">·</span>
          <span className="text-[#E0A030]">{stats.lowBattery} low battery</span>
          <span className="mx-2 text-[var(--color-ink)]/30">·</span>
          <span className="text-[var(--color-emergency)]">{stats.offline72h} offline &gt; 72h</span>
          {stats.openTickets > 0 && (
            <>
              <span className="mx-2 text-[var(--color-ink)]/30">·</span>
              <span className="text-[var(--color-emergency)]">{stats.openTickets} open tickets</span>
            </>
          )}
        </p>
      </div>

      {/* Per-valley and per-district breakdown */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownTable title="By Valley" rows={byValley} />
        <BreakdownTable title="By District" rows={byDistrict} />
      </div>
    </section>
  )
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string
  rows: { label: string; total: number; reporting: number; offline: number; lowBattery: number }[]
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-base)] px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
          {title}
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-[var(--color-ink)]/40">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Reporting</th>
            <th className="px-4 py-2">Offline</th>
            <th className="px-4 py-2">Low batt.</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r) => (
            <tr key={r.label} className="border-t border-[var(--color-border)]">
              <td className="px-4 py-2">{r.label}</td>
              <td className="px-4 py-2 font-mono">
                {r.reporting}/{r.total}
              </td>
              <td className="px-4 py-2 font-mono text-[var(--color-emergency)]">{r.offline}</td>
              <td className="px-4 py-2 font-mono text-[#E0A030]">{r.lowBattery}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
