// app/api/stations/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('station_health')
    .select('station_id, name, kind, district_id, status, battery_voltage, last_transmission_at, rssi, lon, lat')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const features = (data ?? [])
    .filter((s) => s.lon != null && s.lat != null)
    .map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        station_id: s.station_id,
        name: s.name,
        kind: s.kind,
        district_id: s.district_id,
        status: s.status,
        battery_voltage: s.battery_voltage,
        last_transmission_at: s.last_transmission_at,
        rssi: s.rssi,
      },
    }))

  return NextResponse.json({ type: 'FeatureCollection', features })
}