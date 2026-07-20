import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buildAuditQuery, ACTION_LABELS } from '@/lib/audit'
import AuditLogTable from './AuditLogTable'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{
    q?: string
    action?: string
    entity?: string
    entity_id?: string
    actor_role?: string
    from?: string
    to?: string
    page?: string
  }>
}) {
  const { locale } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/${locale}/login`)

  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1)
  const filters = {
    q: sp.q,
    action: sp.action,
    entity: sp.entity,
    entityId: sp.entity_id,
    actorRole: sp.actor_role,
    from: sp.from,
    to: sp.to,
    page,
    limit: 50,
  }

  const { data: logs, error, count } = await buildAuditQuery(supabase, filters)
  const totalPages = count ? Math.ceil(count / filters.limit) : 1

  const filterDefaults = {
    q: sp.q ?? '',
    action: sp.action ?? '',
    entity: sp.entity ?? '',
    entity_id: sp.entity_id ?? '',
    actor_role: sp.actor_role ?? '',
    from: sp.from ?? '',
    to: sp.to ?? '',
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="text-lg font-semibold text-white">System Audit Log</h1>
        {count != null && (
          <span className="ml-auto rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white">
            {count.toLocaleString()} entries
          </span>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <AuditLogTable
            locale={locale}
            logs={logs ?? []}
            error={error?.message}
            filterDefaults={filterDefaults}
            page={page}
            totalPages={totalPages}
            actionOptions={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </div>
    </div>
  )
}
