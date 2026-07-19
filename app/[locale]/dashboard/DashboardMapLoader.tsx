'use client'

import dynamic from 'next/dynamic'

// deck.gl + maplibre-gl are large client-only libraries. Loading them
// eagerly (a plain static import) means every visit to the dashboard ships
// and parses that whole bundle before anything is interactive, even before
// the map itself has value on screen. `ssr:false` here defers the import to
// the browser and code-splits it into its own chunk, so the rest of the
// dashboard (KPIs, header, feed) can render immediately while the map
// bundle streams in behind it.
const DashboardMap = dynamic(() => import('./DashboardMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-ink)]/50">
      Loading hazard map…
    </div>
  ),
})

export default DashboardMap
