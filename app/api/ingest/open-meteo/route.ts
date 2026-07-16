import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'


const FOCUS_DISTRICTS = ['Chitral Lower', 'Chitral Upper', 'Swat', 'Hunza']

export async function GET() {
  const supabase = createAdminClient()
  try {
    const { data: districts, error: districtError } = await supabase
      .from('district')
      .select('id, name_en, centroid')
      .in('name_en', FOCUS_DISTRICTS)
    if (districtError) throw districtError

    const results = []
    for (const d of districts ?? []) {
      const { data: coord } = await supabase.rpc('get_district_lonlat', { district_id: d.id })
      const lon = coord?.[0]?.lon
      const lat = coord?.[0]?.lat
      if (!lon || !lat) continue

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,temperature_2m,snowfall&forecast_days=1`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        console.error(`Open-Meteo API error for ${d.name_en} (status ${res.status}):`, JSON.stringify(data))
        results.push({ district: d.name_en, error: `API returned ${res.status}: ${JSON.stringify(data)}` })
        continue
      }

      const reading = {
        district_id: d.id,
        precipitation: data.hourly?.precipitation?.[0] ?? null,
        temperature: data.hourly?.temperature_2m?.[0] ?? null,
        snowfall: data.hourly?.snowfall?.[0] ?? null,
        fetched_at: new Date().toISOString(),
      }

      if (reading.precipitation === null && reading.temperature === null && reading.snowfall === null) {
        console.error(`Open-Meteo returned empty hourly data for ${d.name_en}:`, JSON.stringify(data))
      }

      const { error: insertError } = await supabase
        .from('weather_reading')
        .upsert(reading, { onConflict: 'district_id' })
      if (insertError) console.error(`Weather store failed for ${d.name_en}:`, insertError.message)
      results.push({ district: d.name_en, ...reading })
    }

    await supabase.from('ingest_status').upsert(
      { source: 'open-meteo', last_success_at: new Date().toISOString(), status: 'ok', last_error: null, last_error_at: null },
      { onConflict: 'source' }
    )
    return NextResponse.json({ stored: results.length, results })
  } catch (err) {
    await supabase.from('ingest_status').upsert(
      { source: 'open-meteo', last_error: String(err), last_error_at: new Date().toISOString(), status: 'failed' },
      { onConflict: 'source' }
    )
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}