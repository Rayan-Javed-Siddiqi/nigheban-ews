import { createAdminClient } from '@/lib/supabase/admin'
import { writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'

const SOURCE = 'nasa_firms'

// Pakistan bounding box (west,south,east,north) per build guide S5
const BBOX = '69.2,31.5,77.9,37.1'

export async function GET() {
  const supabase = createAdminClient()
  const mapKey = process.env.FIRMS_MAP_KEY

  if (!mapKey) {
    return NextResponse.json({ error: 'FIRMS_MAP_KEY not set' }, { status: 500 })
  }

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/${BBOX}/2`
    const res = await fetch(url, { cache: 'no-store' })
    const csvText = await res.text()

    const lines = csvText.trim().split('\n')
    const headers = lines[0].split(',')
    const latIdx = headers.indexOf('latitude')
    const lonIdx = headers.indexOf('longitude')
    const confIdx = headers.indexOf('confidence')
    const dateIdx = headers.indexOf('acq_date')
    const timeIdx = headers.indexOf('acq_time')

    const fires = lines.slice(1).filter(Boolean).map((line) => {
      const cols = line.split(',')
      return {
        lat: parseFloat(cols[latIdx]),
        lon: parseFloat(cols[lonIdx]),
        confidence: cols[confIdx],
        date: cols[dateIdx],
        time: cols[timeIdx],
      }
    })

    let inserted = 0
    for (const fire of fires) {
      const externalId = `firms-${fire.lat}-${fire.lon}-${fire.date}-${fire.time}`
      const { error } = await supabase.from('hazard_event').upsert(
        {
          hazard: 'fire',
          source: 'nasa_firms',
          severity: fire.confidence === 'h' ? 'warning' : 'advisory',
          title: `Fire hotspot (${fire.confidence} confidence)`,
          geom: `SRID=4326;POINT(${fire.lon} ${fire.lat})`,
          starts_at: new Date(`${fire.date}T${fire.time.padStart(4, '0').slice(0,2)}:${fire.time.padStart(4, '0').slice(2,4)}:00Z`).toISOString(),
          raw: fire,
          external_id: externalId,
        },
        { onConflict: 'external_id' }
      )
      if (!error) inserted++
      else console.error('FIRMS insert failed:', error.message)
    }

    await writeIngestStatus(supabase, SOURCE, 'ok')
    return NextResponse.json({ fetched: fires.length, inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}