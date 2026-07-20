import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** GeoJSON FeatureCollection of hazard_event points, optionally filtered by hazard type. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const hazard = new URL(request.url).searchParams.get('hazard')

  if (!hazard) {
    const { data, error } = await supabase.rpc('get_hazard_events_geojson')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  }

  const { data, error } = await supabase
    .from('hazard_event')
    .select('id, hazard, severity, title, starts_at, geom')
    .eq('hazard', hazard)
    .not('geom', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const features = (data ?? [])
    .filter((e) => e.geom)
    .map((e) => ({
      type: 'Feature' as const,
      geometry: typeof e.geom === 'string' ? JSON.parse(e.geom) : e.geom,
      properties: {
        id: e.id,
        hazard: e.hazard,
        severity: e.severity,
        title: e.title,
        starts_at: e.starts_at,
      },
    }))

  return NextResponse.json({ type: 'FeatureCollection', features }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
