import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Pakistan bounding box with a buffer, per the build guide (S6)
const BBOX = { minLon: 60.0, minLat: 22.0, maxLon: 80.0, maxLat: 38.0 }

interface UsgsFeature {
  id: string
  properties: {
    mag: number
    place: string
    time: number
    type: string
  }
  geometry: {
    type: string
    coordinates: [number, number, number]
  }
}

export async function GET() {
  const supabase = createAdminClient()

  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      { cache: 'no-store' }
    )
    const data = await res.json()

    const relevant = (data.features as UsgsFeature[]).filter((f) => {
      const [lon, lat] = f.geometry.coordinates
      return (
        lon >= BBOX.minLon &&
        lon <= BBOX.maxLon &&
        lat >= BBOX.minLat &&
        lat <= BBOX.maxLat
      )
    })

    let inserted = 0
    for (const eq of relevant) {
      const [lon, lat] = eq.geometry.coordinates
      const severity =
        eq.properties.mag >= 6 ? 'emergency' :
        eq.properties.mag >= 5 ? 'warning' :
        eq.properties.mag >= 4.5 ? 'watch' : 'advisory'

      const { error } = await supabase.from('hazard_event').upsert(
        {
          hazard: 'earthquake',
          source: 'usgs',
          severity,
          title: `M${eq.properties.mag} — ${eq.properties.place}`,
          geom: `SRID=4326;POINT(${lon} ${lat})`,
          starts_at: new Date(eq.properties.time).toISOString(),
          raw: eq,
          external_id: eq.id,
        },
        { onConflict: 'external_id' }
      )
      if (!error) inserted++
      else console.error('Insert failed:', error.message)
    }

    await supabase.from('ingest_status').upsert(
      {
        source: 'usgs',
        last_success_at: new Date().toISOString(),
        status: 'ok',
      },
      { onConflict: 'source' }
    )

    return NextResponse.json({
      fetched: relevant.length,
      inserted,
      total_from_usgs: data.features.length,
    })
  } catch (err) {
    await supabase.from('ingest_status').upsert(
      {
        source: 'usgs',
        last_error: String(err),
        last_error_at: new Date().toISOString(),
        status: 'failed',
      },
      { onConflict: 'source' }
    )
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}