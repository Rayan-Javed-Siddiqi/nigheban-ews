// app/api/ingest/flood-open-meteo/route.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'

const SOURCE = 'open-meteo-flood'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: districts, error: districtsError } = await supabase
    .from('district_centroid_latlon')
    .select('district_id, lat, lon')

  if (districtsError || !districts) {
    return NextResponse.json({ error: districtsError?.message ?? 'failed to load districts' }, { status: 500 })
  }

  const lats = districts.map((d) => d.lat).join(',')
  const lons = districts.map((d) => d.lon).join(',')

  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lons}&daily=river_discharge,river_discharge_mean&forecast_days=7`

  let apiData: any
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Open-Meteo Flood API returned ${res.status}`)
    apiData = await res.json()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await writeIngestStatus(supabase, SOURCE, 'degraded', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  // With multiple locations, Open-Meteo returns an array; with one, it returns a single object
  const results: any[] = Array.isArray(apiData) ? apiData : [apiData]

  const rows: Record<string, unknown>[] = []
  results.forEach((result, i) => {
    const district = districts[i]
    if (!district || !result?.daily?.time) return

    const times: string[] = result.daily.time
    const discharge: number[] = result.daily.river_discharge ?? []
    const dischargeMean: number[] = result.daily.river_discharge_mean ?? []

    times.forEach((date: string, dayIdx: number) => {
      const value = discharge[dayIdx]
      const mean = dischargeMean[dayIdx]
      if (value == null || mean == null || mean === 0) return

      const ratio = value / mean
      const risk_level = ratio > 1.5 ? 'high' : ratio > 1.2 ? 'medium' : 'low'

      rows.push({
        district_id: district.district_id,
        forecast_date: date,
        river_discharge: value,
        river_discharge_mean: mean,
        risk_level,
        source: 'open-meteo-flood',
      })
    })
  })

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('flood_forecast')
      .upsert(rows, { onConflict: 'district_id,forecast_date' })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
  }

  await writeIngestStatus(supabase, SOURCE, 'ok')

  return NextResponse.json({ ok: true, districts_processed: districts.length, rows_written: rows.length })
}