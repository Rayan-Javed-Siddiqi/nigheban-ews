import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchPmdFfdSnapshot, legacyJsonToRivers } from '@/lib/ingest/pmd-fetch'
import { normalizeFloodLevel, resolveGaugeCoord } from '@/lib/pmd/rivers'

export const dynamic = 'force-dynamic'

/** GeoJSON of PMD FFD river gauge status for map layer S3. */
export async function GET() {
  const supabase = await createClient()

  let rivers = legacyJsonToRivers(
    (
      await supabase
        .from('pmd_forecasts')
        .select('rivers')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.rivers
  )

  if (rivers.length === 0) {
    try {
      const live = await fetchPmdFfdSnapshot()
      rivers = live.rivers
    } catch {
      return NextResponse.json({ type: 'FeatureCollection', features: [] })
    }
  }

  const features = rivers
    .map((r) => {
      const coord = resolveGaugeCoord(r.name, r.location)
      if (!coord) return null
      const level = normalizeFloodLevel(r.flood_level)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [coord.lon, coord.lat] },
        properties: {
          name: coord.label,
          river: r.name,
          location: r.location,
          discharge_cusecs: r.flow_cusecs,
          ffd_risk: r.flood_level ?? level,
          flood_level: level,
          source: 'pmd_ffd',
        },
      }
    })
    .filter(Boolean)

  return NextResponse.json({
    type: 'FeatureCollection',
    features,
  })
}
