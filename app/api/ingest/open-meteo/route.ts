import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// One representative coordinate per focus district for now (Day 2 scope).
// We'll expand to all 49 districts once the station/observation pipeline matures.
const DISTRICT_POINTS = [
  { name: 'Chitral', lat: 35.85, lon: 71.78 },
  { name: 'Swat', lat: 35.22, lon: 72.42 },
  { name: 'Hunza', lat: 36.32, lon: 74.65 },
]

export async function GET() {
  const supabase = createAdminClient()
  const results = []

  try {
    for (const point of DISTRICT_POINTS) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&hourly=precipitation,temperature_2m,snowfall&forecast_days=7`

      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()

      results.push({
        district: point.name,
        current_precipitation: data.hourly?.precipitation?.[0] ?? null,
        current_temp: data.hourly?.temperature_2m?.[0] ?? null,
        current_snowfall: data.hourly?.snowfall?.[0] ?? null,
      })
    }

    await supabase.from('ingest_status').upsert(
      {
        source: 'open-meteo',
        last_success_at: new Date().toISOString(),
        status: 'ok',
        last_error: null,
        last_error_at: null,
      },
      { onConflict: 'source' }
    )

    return NextResponse.json({ fetched: results.length, results })
  } catch (err) {
    await supabase.from('ingest_status').upsert(
      {
        source: 'open-meteo',
        last_error: String(err),
        last_error_at: new Date().toISOString(),
        status: 'failed',
      },
      { onConflict: 'source' }
    )
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}