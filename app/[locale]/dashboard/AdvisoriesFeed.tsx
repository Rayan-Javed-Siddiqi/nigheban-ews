import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdvisoriesFeed() {
  const supabase = await createClient()
  
  // Fetch the latest 10 advisories across all districts, joining the district name
  const { data: advisories, error } = await supabase
    .from('advisory')
    .select('*, district:district_id(id, name_en, province)')
    .order('issued_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching advisories:', error)
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/70">
          Latest Advisories
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {!advisories || advisories.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/50">No recent advisories found.</p>
        ) : (
          <div className="space-y-4">
            {advisories.map((a) => (
              <div key={a.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-[var(--color-ink)]/50">
                    {a.source}
                  </span>
                  <span className="text-[10px] text-[var(--color-ink)]/40">
                    {new Date(a.issued_at).toLocaleDateString('en-GB', { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </span>
                </div>
                <h3 className="mb-1 text-sm font-medium leading-tight text-[var(--color-ink)]">
                  {a.title}
                </h3>
                {a.body && (
                  <p className="mb-2 line-clamp-3 text-xs text-[var(--color-ink)]/70">
                    {a.body}
                  </p>
                )}
                {a.district && (
                  <Link 
                    href={`/dashboard/district/${a.district.id}`}
                    className="mt-2 inline-block text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {a.district.name_en}, {a.district.province} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
