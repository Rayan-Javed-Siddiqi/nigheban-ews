// app/api/stations/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('station_health')
    .select('station_id, name, kind, status, battery_voltage, last_transmission_at, rssi, lon, lat')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: meta } = await supabase
    .from('station')
    .select('id, valley, district:district_id(name_en)')

  const metaById = new Map(
    (meta ?? []).map((s) => [
      s.id,
      {
        valley: s.valley as string | null,
        district_name: (s.district as { name_en: string } | null)?.name_en ?? null,
      },
    ])
  )

  const features = (data ?? [])
    .filter((s) => s.lon != null && s.lat != null)
    .map((s) => {
      const m = metaById.get(s.station_id)
      return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        station_id: s.station_id,
        name: s.name,
        kind: s.kind,
        valley: m?.valley ?? null,
        district_name: m?.district_name ?? null,
        status: s.status,
        battery_voltage: s.battery_voltage,
        last_transmission_at: s.last_transmission_at,
        rssi: s.rssi,
      },
    }
    })

  return NextResponse.json({ type: 'FeatureCollection', features })
}