import { createAdminClient } from '@/lib/supabase/admin'
import { writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'

const SOURCE = 'chirps-drought'

const HISTORICAL_MEAN_90DAY = 180.0
const HISTORICAL_STDDEV_90DAY = 75.0

function calculateSpi(totalPrecip: number): number {
  if (HISTORICAL_STDDEV_90DAY === 0) return 0
  const spi = (totalPrecip - HISTORICAL_MEAN_90DAY) / HISTORICAL_STDDEV_90DAY
  return Math.max(-3, Math.min(3, Math.round(spi * 100) / 100))
}

async function fetchPrecipitation(lat: number, lon: number, days = 90): Promise<number[] | null> {
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - days)

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}` +
    `&daily=precipitation_sum&timezone=UTC`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null

  const data = await res.json()
  const values: (number | null)[] = data?.daily?.precipitation_sum ?? []
  const filtered = values.filter((v): v is number => v != null)
  return filtered.length > 30 ? filtered : null
}

export async function GET() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  try {
    const { data: districts, error: districtError } = await supabase
      .from('district_centroid_latlon')
      .select('district_id, lat, lon')

    if (districtError) throw districtError
    if (!districts?.length) throw new Error('No districts with centroids found')

    let success = 0
    let errors = 0

    for (const d of districts) {
      const precip = await fetchPrecipitation(d.lat, d.lon)
      if (!precip) {
        errors++
        continue
      }

      const total = precip.reduce((sum, v) => sum + v, 0)
      const spi3 = calculateSpi(total)

      const { error: upsertError } = await supabase.from('drought_index').upsert(
        { district_id: d.district_id, spi_3: spi3, date: today },
        { onConflict: 'district_id,date' }
      )

      if (upsertError) {
        console.error(`[ingest:${SOURCE}] upsert failed:`, upsertError.message)
        errors++
      } else {
        success++
      }
    }

    if (success === 0) {
      throw new Error(`Drought ingest failed for all ${districts.length} districts`)
    }

    const status = errors > 0 ? 'degraded' : 'ok'
    await writeIngestStatus(
      supabase,
      SOURCE,
      status,
      errors > 0 ? `${errors} districts failed` : undefined
    )

    return NextResponse.json({
      ok: true,
      districts_processed: districts.length,
      success,
      errors,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
