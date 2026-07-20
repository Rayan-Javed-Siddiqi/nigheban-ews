import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'

const LIST_COLUMNS =
  'id, district_id, title, description, severity, metric_name, observed_value, threshold_value, status, created_at'

async function dismissCandidate(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  if (profile?.role !== 'duty_officer' && profile?.role !== 'dg') {
    throw new Error('Only duty officers or DG can dismiss candidates')
  }

  const { error } = await supabase.from('alert_candidate').update({ status: 'dismissed' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/${locale}/dashboard/alerts`)
}

export default async function AlertsReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const [{ data: candidates, error }, { count: openTotal }] = await Promise.all([
    supabase
      .from('alert_candidate')
      .select(`${LIST_COLUMNS}, district:district_id(name_en, province)`)
      .in('status', ['pending', 'draft', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('alert_candidate')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'draft', 'pending_approval']),
  ])

  if (error) {
    console.error('[alerts] list query failed:', error.message)
  }

  const sortedCandidates = (candidates ?? []).sort((a, b) => {
    const rank: Record<string, number> = { pending_approval: 1, draft: 2, pending: 3 }
    return (rank[a.status] || 99) - (rank[b.status] || 99)
  })

  const showing = sortedCandidates.length
  const totalOpen = openTotal ?? showing

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="text-lg font-semibold text-white">Alert Candidate Review</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm text-[var(--color-ink)]/60">
            Rule-fired candidates enter as <strong>pending</strong>. Duty officers draft CAP fields → submit for DG approval → DG issues.
          </p>
          {totalOpen > showing && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Showing the <strong>{showing} most recent</strong> of <strong>{totalOpen.toLocaleString()}</strong> open candidates.
            </p>
          )}
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Open Candidates ({showing}
            {totalOpen > showing ? ` of ${totalOpen.toLocaleString()}` : ''})
          </h2>

          {sortedCandidates.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-ink)]/50">
              No pending alerts require review.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedCandidates.map((c) => (
                <div key={c.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--color-emergency)]/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-[var(--color-emergency)]">
                        {c.severity}
                      </span>
                      {c.status === 'pending_approval' && (
                        <span className="rounded border border-yellow-300 bg-yellow-100 px-2 py-0.5 font-mono text-xs font-bold uppercase text-yellow-800">
                          Requires DG Approval
                        </span>
                      )}
                      {c.status === 'draft' && (
                        <span className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold uppercase text-gray-600">
                          Drafting in Progress
                        </span>
                      )}
                      {c.status === 'pending' && (
                        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold uppercase text-blue-600">
                          New — awaiting CAP draft
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-[var(--color-ink)]/40">
                      Generated {new Date(c.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <Link
                    href={`/${locale}/dashboard/alerts/${c.id}`}
                    className="text-lg font-semibold text-[var(--color-ink)] hover:underline"
                  >
                    {c.title}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--color-ink)]/70">{c.description}</p>

                  <div className="mt-4 grid grid-cols-2 gap-4 rounded bg-[var(--color-base)] p-3 font-mono text-xs">
                    <div>
                      <span className="text-[var(--color-ink)]/50">Metric:</span> {c.metric_name}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">District:</span>{' '}
                      {c.district ? `${c.district.name_en}, ${c.district.province}` : 'Global'}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">Observed:</span> {c.observed_value}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">Threshold:</span> {c.threshold_value}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/${locale}/dashboard/alerts/${c.id}`}
                      className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)]"
                    >
                      Open CAP Composer
                    </Link>
                    {c.status === 'pending' && (
                      <form action={dismissCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <button
                          type="submit"
                          className="rounded-md border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-border)]"
                        >
                          Dismiss
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
