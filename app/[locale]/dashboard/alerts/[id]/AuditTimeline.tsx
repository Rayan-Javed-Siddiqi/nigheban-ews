import Link from 'next/link'
import {
  actionLabel,
  formatAuditTimestamp,
  formatDetail,
  type AuditLogRow,
} from '@/lib/audit'

export default function AuditTimeline({
  logs,
  actorNames,
  locale,
  deliveryStats,
}: {
  logs: AuditLogRow[]
  actorNames: Record<string, string>
  locale: string
  deliveryStats?: {
    total: number
    acknowledged: number
    ackRate?: number
  } | null
}) {
  if (logs.length === 0) return null

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
        Audit Timeline
      </h2>
      <ol className="relative space-y-0 border-l-2 border-[var(--color-primary)]/30 pl-6">
        {logs.map((log, i) => {
          const actor =
            log.actor && actorNames[log.actor]
              ? actorNames[log.actor]
              : log.actor_role?.toUpperCase() || 'SYSTEM'
          const detail = formatDetail(log.detail)
          const isLast = i === logs.length - 1

          return (
            <li key={log.id} className={`relative pb-6 ${isLast ? 'pb-0' : ''}`}>
              <span className="absolute -left-[1.65rem] top-1 flex h-3 w-3 rounded-full border-2 border-white bg-[var(--color-primary)]" />
              <div className="rounded border border-[var(--color-border)] bg-white p-3 shadow-sm">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--color-ink)]">{actionLabel(log.action)}</span>
                  <span className="font-mono text-xs text-[var(--color-ink)]/50">
                    {formatAuditTimestamp(log.at)}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-ink)]/70">
                  Actor: <span className="font-semibold">{actor}</span>
                  {detail && (
                    <span className="ml-2 text-xs text-[var(--color-ink)]/50">({detail})</span>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ol>

      {deliveryStats && deliveryStats.total > 0 && (
        <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink)]/60">
          Dissemination: {deliveryStats.total} delivery rows · {deliveryStats.acknowledged} acknowledged
          {deliveryStats.ackRate != null && ` (${deliveryStats.ackRate}% ack rate)`}
        </p>
      )}

      <Link
        href={`/${locale}/dashboard/audit?entity=alert_candidate&entity_id=${logs[0]?.entity_id ?? ''}`}
        className="mt-3 inline-block text-xs text-[var(--color-primary)] hover:underline"
      >
        View in global audit log →
      </Link>
    </div>
  )
}
