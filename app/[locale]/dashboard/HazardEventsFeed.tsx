import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { compareSeverity, formatPkt, hazardIcon, severityBadgeClass } from '@/lib/hazard-console'

export default async function HazardEventsFeed() {
  const supabase = await createClient()

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const { data: events, error } = await supabase
    .from('hazard_event')
    .select('id, hazard, severity, title, starts_at, source')
    .gte('starts_at', threeDaysAgo)
    .order('starts_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching hazard events:', error)
  }

  const sorted = (events ?? []).sort(
    (a, b) =>
      compareSeverity(a.severity, b.severity) ||
      new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime()
  )

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/50">No active hazard events in the last 72 hours.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-[var(--color-border)] p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-[var(--color-ink)]/50">
                  {hazardIcon(e.hazard)} {e.hazard} · {e.source}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${severityBadgeClass(e.severity)}`}
                >
                  {e.severity}
                </span>
              </div>
              <h3 className="text-sm font-medium leading-tight text-[var(--color-ink)]">
                {e.title}
              </h3>
              <p className="mt-1 font-mono text-[10px] text-[var(--color-ink)]/40">
                {formatPkt(e.starts_at)} PKT
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
