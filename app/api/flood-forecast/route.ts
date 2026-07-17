// app/api/flood-forecast/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('district_flood_risk_geojson').select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const features = (data ?? [])
    .filter((d) => d.geometry_json)
    .map((d) => ({
      type: 'Feature',
      geometry: JSON.parse(d.geometry_json),
      properties: {
        district_id: d.district_id,
        name_en: d.name_en,
        risk_level: d.risk_level ?? 'unknown',
        forecast_date: d.forecast_date,
        river_discharge: d.river_discharge,
      },
    }))

  return NextResponse.json({ type: 'FeatureCollection', features })
}