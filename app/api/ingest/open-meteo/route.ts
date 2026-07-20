import { createAdminClient } from '@/lib/supabase/admin'
import { writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'

const SOURCE = 'open-meteo'
const BATCH_SIZE = 20

interface OpenMeteoResult {
  latitude: number
  longitude: number
  hourly?: {
    precipitation?: (number | null)[]
    temperature_2m?: (number | null)[]
    snowfall?: (number | null)[]
  }
}

export async function GET() {
  const supabase = createAdminClient()

  try {
    const { data: districts, error: districtError } = await supabase
      .from('district_centroid_latlon')
      .select('district_id, lat, lon')

    if (districtError) throw districtError
    if (!districts?.length) throw new Error('No districts with centroids found')

    const results: Record<string, unknown>[] = []
    let stored = 0

    for (let i = 0; i < districts.length; i += BATCH_SIZE) {
      const batch = districts.slice(i, i + BATCH_SIZE)
      const lats = batch.map((d) => d.lat).join(',')
      const lons = batch.map((d) => d.lon).join(',')

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        `&hourly=precipitation,temperature_2m,snowfall&forecast_days=1`

      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        console.error(`[ingest:${SOURCE}] API error (batch ${i / BATCH_SIZE + 1}):`, data)
        continue
      }

      const items: OpenMeteoResult[] = Array.isArray(data) ? data : [data]

      for (let j = 0; j < batch.length; j++) {
        const district = batch[j]
        const item = items[j]
        if (!item?.hourly) continue

        const reading = {
          district_id: district.district_id,
          precipitation: item.hourly.precipitation?.[0] ?? null,
          temperature: item.hourly.temperature_2m?.[0] ?? null,
          snowfall: item.hourly.snowfall?.[0] ?? null,
          fetched_at: new Date().toISOString(),
        }

        const { error: insertError } = await supabase
          .from('weather_reading')
          .upsert(reading, { onConflict: 'district_id' })

        if (insertError) {
          console.error(`[ingest:${SOURCE}] weather upsert failed:`, insertError.message)
        } else {
          stored++
        }
        results.push(reading)
      }
    }

    if (stored === 0) {
      throw new Error('Open-Meteo ingest completed with zero stored readings')
    }

    await writeIngestStatus(supabase, SOURCE, 'ok')
    return NextResponse.json({ ok: true, stored, districts: districts.length, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
