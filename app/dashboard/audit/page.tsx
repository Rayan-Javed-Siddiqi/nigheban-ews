import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const query = searchParams.q || ''

  // Using service role here temporarily in case audit_log lacks select policies for standard users.
  // We want all users to be able to see the global audit log per requirements.
  let dbQuery = supabase
    .from('audit_log')
    .select('*')
    .order('at', { ascending: false })
    .limit(100)

  if (query) {
    dbQuery = dbQuery.or(`action.ilike.%${query}%,entity.ilike.%${query}%,entity_id.ilike.%${query}%`)
  }

  const { data: logs, error } = await dbQuery

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="text-lg font-semibold text-white">System Audit Log</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Recent Activity</h2>
            
            <form className="flex w-full max-w-sm gap-2">
              <input 
                type="text" 
                name="q" 
                defaultValue={query}
                placeholder="Search action or entity..." 
                className="w-full rounded border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm"
              />
              <button type="submit" className="rounded bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]">
                Search
              </button>
            </form>
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
            <table className="w-full text-left text-sm text-[var(--color-ink)]">
              <thead className="bg-[var(--color-surface)] text-xs uppercase text-[var(--color-ink)]/60">
                <tr>
                  <th className="px-4 py-3 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Entity ID</th>
                  <th className="px-4 py-3 font-semibold">Actor Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--color-surface)]">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--color-ink)]/70">
                        {new Date(log.at).toLocaleString('en-GB')}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <span className="rounded bg-[var(--color-border)] px-2 py-0.5 text-xs">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">{log.entity || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{log.entity_id || '-'}</td>
                      <td className="px-4 py-3">
                        {log.actor_role === 'service_role' ? (
                          <span className="text-orange-600 font-semibold text-xs">SYSTEM</span>
                        ) : (
                          <span className="text-blue-600 font-semibold text-xs">{log.actor_role?.toUpperCase() || 'UNKNOWN'}</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-ink)]/50">
                      {error ? `Error: ${error.message}` : 'No audit logs found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
