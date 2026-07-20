import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardMap from './DashboardMapLoader'
import SourceHealthFooter from './SourceHealthFooter'
import HazardConsoleSidebar from './HazardConsoleSidebar'
import HazardEventsFeed from './HazardEventsFeed'
import AdvisoriesFeed from './AdvisoriesFeed'
import ReplayKpiStrip from '@/lib/replay/ReplayKpiStrip'
import ReplayChrome from '@/lib/replay/ReplayChrome'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }
  // These four queries don't depend on each other's results, so run them
  // concurrently instead of one at a time — this was previously four
  // sequential round trips to Supabase before the page could render at all.
  const today = new Date().toISOString().slice(0, 10)
  const [
    { data: profile },
    { count: districtCount },
    { data: issuedAlerts },
    { count: totalDeliveries },
    { count: deliveredCount },
    { data: floodAffected },
  ] = await Promise.all([
    supabase.from('profile').select('full_name, role').eq('id', user.id).single(),
    supabase.from('district').select('*', { count: 'exact', head: true }),
    supabase.from('alert_candidate').select('id, district_id, district:district_id(population)').eq('status', 'issued'),
    supabase.from('alert_delivery').select('*', { count: 'exact', head: true }),
    supabase.from('alert_delivery').select('*', { count: 'exact', head: true }).in('status', ['delivered', 'acknowledged']),
    supabase
      .from('flood_forecast')
      .select('district_id')
      .in('risk_level', ['high', 'medium'])
      .gte('forecast_date', today),
  ])

  const activeWarnings = issuedAlerts?.length || 0
  const popAffected = issuedAlerts?.reduce((sum: number, a: { district?: { population?: number } | null }) => sum + (a.district?.population || 0), 0) || 0

  const affectedDistrictIds = new Set<string>()
  issuedAlerts?.forEach((a: { district_id?: string | null }) => {
    if (a.district_id) affectedDistrictIds.add(a.district_id)
  })
  floodAffected?.forEach((f: { district_id: string }) => affectedDistrictIds.add(f.district_id))
  const districtsAffected = affectedDistrictIds.size
  
  const totalDel = totalDeliveries ?? 0
  const delCount = deliveredCount ?? 0
  const deliveryRate = totalDel > 0 ? Math.round((delCount / totalDel) * 100) : 0
  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <ReplayChrome />
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
          <a href={`/${locale}/dashboard/replay`} className="text-sm text-amber-200 underline hover:text-white">
            Replay Mode →
          </a>
          <a href={`/${locale}/dashboard/audit`} className="text-sm text-white/80 underline hover:text-white">
            Audit Log →
          </a>
          <a href={`/${locale}/dashboard/alerts`} className="text-sm font-medium text-[var(--color-emergency)] hover:text-red-400">
            Review Alerts →
          </a>
          <a href={`/${locale}/dashboard/stations`} className="text-sm text-white/80 underline hover:text-white">
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
      <ReplayKpiStrip
        live={{
          activeWarnings,
          districtsAffected: districtsAffected > 0 ? districtsAffected : '—',
          districtCount: districtCount ?? 0,
          popAffected,
          deliveryRate: totalDel > 0 ? `${deliveryRate}%` : '—',
          deliveryDetail: totalDel > 0 ? `(${delCount}/${totalDel})` : '',
        }}
      />
      {/* Source health strip */}
      <SourceHealthFooter />
      {/* Main content: Map and Sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <DashboardMap />
        </div>
        <HazardConsoleSidebar
          hazardsPanel={<HazardEventsFeed />}
          advisoriesPanel={<AdvisoriesFeed />}
        />
      </div>
    </div>
  )
}