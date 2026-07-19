import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'

async function approveCandidate(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const supabase = await createClient()
  const { error } = await supabase.from('alert_candidate').update({ status: 'approved' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/alerts')
}

async function dismissCandidate(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const supabase = await createClient()
  const { error } = await supabase.from('alert_candidate').update({ status: 'dismissed' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/alerts')
}

export default async function AlertsReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: candidates } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, province)')
    .in('status', ['pending', 'draft', 'pending_approval'])
    .order('created_at', { ascending: false })

  const sortedCandidates = candidates?.sort((a, b) => {
    const rank: Record<string, number> = { 'pending_approval': 1, 'draft': 2, 'pending': 3 }
    return (rank[a.status] || 99) - (rank[b.status] || 99)
  }) || []

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="text-lg font-semibold text-white">Alert Candidate Review</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Pending Candidates ({sortedCandidates.length})
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
                    <div className="flex gap-2 items-center">
                      <span className="rounded bg-[var(--color-emergency)]/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-[var(--color-emergency)]">
                        {c.severity}
                      </span>
                      {c.status === 'pending_approval' && (
                        <span className="rounded bg-yellow-100 text-yellow-800 px-2 py-0.5 font-mono text-xs font-bold uppercase border border-yellow-300">
                          Requires DG Approval
                        </span>
                      )}
                      {c.status === 'draft' && (
                        <span className="rounded bg-gray-100 text-gray-600 px-2 py-0.5 font-mono text-xs font-bold uppercase border border-gray-300">
                          Drafting in Progress
                        </span>
                      )}
                      {c.status === 'pending' && (
                        <span className="rounded bg-blue-50 text-blue-600 px-2 py-0.5 font-mono text-xs font-bold uppercase border border-blue-200">
                          New Unassigned
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-[var(--color-ink)]/40">
                      Generated {new Date(c.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <Link href={`/dashboard/alerts/${c.id}`} className="text-lg font-semibold text-[var(--color-ink)] hover:underline">
  {c.title}
</Link>
                  <p className="mt-1 text-sm text-[var(--color-ink)]/70">{c.description}</p>
                  
                  <div className="mt-4 grid grid-cols-2 gap-4 rounded bg-[var(--color-base)] p-3 font-mono text-xs">
                    <div>
                      <span className="text-[var(--color-ink)]/50">Metric:</span> {c.metric_name}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">District:</span> {c.district ? `${c.district.name_en}, ${c.district.province}` : 'Global'}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">Observed:</span> {c.observed_value}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">Threshold:</span> {c.threshold_value}
                    </div>
                  </div>

                  <div className="mt-5 flex gap-3">
                    <form action={approveCandidate}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="rounded-md bg-[var(--color-emergency)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700">
                        Approve &amp; Publish
                      </button>
                    </form>
                    <form action={dismissCandidate}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="rounded-md border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-border)]">
                        Dismiss
                      </button>
                    </form>
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
