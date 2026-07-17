import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardMap from './DashboardMap'
import SourceHealthFooter from './SourceHealthFooter'
import AdvisoriesFeed from './AdvisoriesFeed'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }
  const { data: profile } = await supabase
    .from('profile')
    .select('full_name, role')
    .eq('id', user.id)
    .single()
  const { count: districtCount } = await supabase
    .from('district')
    .select('*', { count: 'exact', head: true })
  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
            <span className="font-mono text-sm font-semibold text-[var(--color-primary)]">N</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Nigheban</h1>
            <p className="text-xs text-white/70">Provincial Overview — KP &amp; GB</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/dashboard/alerts" className="text-sm font-medium text-[var(--color-emergency)] hover:text-red-400">
            Review Alerts →
          </a>
          <a href="/dashboard/stations" className="text-sm text-white/80 underline hover:text-white">
            Station Health →
          </a>
          <span className="text-sm text-white/90">
            {profile?.full_name ?? user.email}
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 font-mono text-xs uppercase">
              {profile?.role ?? 'viewer'}
            </span>
          </span>
        </div>
      </header>
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-px border-b border-[var(--color-border)] bg-[var(--color-border)]">
        <div className="bg-[var(--color-surface)] px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">
            Active Warnings
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">0</p>
        </div>
        <div className="bg-[var(--color-surface)] px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">
            Districts Monitored
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">
            {districtCount ?? 0}
          </p>
        </div>
        <div className="bg-[var(--color-surface)] px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">
            Population Affected
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">—</p>
        </div>
      </div>
      {/* Source health strip */}
      <SourceHealthFooter />
      {/* Main content: Map and Sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <DashboardMap />
        </div>
        <AdvisoriesFeed />
      </div>
    </div>
  )
}