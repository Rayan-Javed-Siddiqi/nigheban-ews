'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actionLabel, formatAuditTimestamp, formatDetail, type AuditLogRow } from '@/lib/audit'

type Props = {
  locale: string
  logs: AuditLogRow[]
  error?: string
  filterDefaults: Record<string, string>
  page: number
  totalPages: number
  actionOptions: { value: string; label: string }[]
}

export default function AuditLogTable({
  locale,
  logs,
  error,
  filterDefaults,
  page,
  totalPages,
  actionOptions,
}: Props) {
  const router = useRouter()

  const applyFilters = (form: HTMLFormElement) => {
    const fd = new FormData(form)
    const params = new URLSearchParams()
    for (const [key, val] of fd.entries()) {
      if (typeof val === 'string' && val.trim()) params.set(key, val.trim())
    }
    params.delete('page')
    router.push(`/${locale}/dashboard/audit?${params.toString()}`)
  }

  return (
    <>
      <form
        className="mb-6 grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm md:grid-cols-3 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters(e.currentTarget)
        }}
      >
        <input
          name="q"
          defaultValue={filterDefaults.q}
          placeholder="Search..."
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm md:col-span-2"
        />
        <select
          name="action"
          defaultValue={filterDefaults.action}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >
          <option value="">All actions</option>
          {actionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          name="entity"
          defaultValue={filterDefaults.entity}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >
          <option value="">All entities</option>
          <option value="alert_candidate">alert_candidate</option>
          <option value="alert_rule">alert_rule</option>
        </select>
        <select
          name="actor_role"
          defaultValue={filterDefaults.actor_role}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >
          <option value="">All roles</option>
          <option value="dg">DG</option>
          <option value="duty_officer">Duty Officer</option>
          <option value="viewer">Viewer</option>
        </select>
        <input
          name="entity_id"
          defaultValue={filterDefaults.entity_id}
          placeholder="Entity ID (UUID)"
          className="rounded border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs md:col-span-2"
        />
        <input
          type="date"
          name="from"
          defaultValue={filterDefaults.from}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={filterDefaults.to}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2 md:col-span-2">
          <button
            type="submit"
            className="rounded bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            Filter
          </button>
          <Link
            href={`/${locale}/dashboard/audit`}
            className="rounded border border-[var(--color-border)] px-4 py-1.5 text-sm hover:bg-[var(--color-surface)]"
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
        <table className="w-full text-left text-sm text-[var(--color-ink)]">
          <thead className="bg-[var(--color-surface)] text-xs uppercase text-[var(--color-ink)]/60">
            <tr>
              <th className="px-4 py-3 font-semibold">Timestamp (PKT)</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Entity</th>
              <th className="px-4 py-3 font-semibold">Detail</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--color-surface)]">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--color-ink)]/70">
                    {formatAuditTimestamp(log.at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-[var(--color-border)] px-2 py-0.5 text-xs font-semibold">
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{log.entity || '—'}</div>
                    {log.entity === 'alert_candidate' && log.entity_id && (
                      <Link
                        href={`/${locale}/dashboard/alerts/${log.entity_id}`}
                        className="font-mono text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {log.entity_id.slice(0, 8)}…
                      </Link>
                    )}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-[var(--color-ink)]/50">
                    {formatDetail(log.detail) || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-blue-600">
                      {log.actor_role?.toUpperCase() || 'SYSTEM'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-ink)]/50">
                  {error ? `Error: ${error}` : 'No audit logs match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link
              href={`/${locale}/dashboard/audit?${new URLSearchParams({ ...filterDefaults, page: String(page - 1) }).toString()}`}
              className="rounded border border-[var(--color-border)] px-3 py-1 hover:bg-white"
            >
              ← Previous
            </Link>
          )}
          <span className="text-[var(--color-ink)]/60">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/${locale}/dashboard/audit?${new URLSearchParams({ ...filterDefaults, page: String(page + 1) }).toString()}`}
              className="rounded border border-[var(--color-border)] px-3 py-1 hover:bg-white"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  )
}
