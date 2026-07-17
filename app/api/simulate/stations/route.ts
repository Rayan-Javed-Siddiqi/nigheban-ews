// app/api/simulate/stations/route.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Per-cycle chance a station misses its transmission entirely (creates Degraded/Offline over time)
const OUTAGE_PROBABILITY = 0.15
const BATTERY_REPLACEMENT_PROBABILITY = 0.05
const LOW_BATTERY_THRESHOLD = 10.5
const FRESH_BATTERY_VOLTAGE = 12.6

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randomWalk(prev: number, min: number, max: number, maxStep: number) {
  const next = prev + rand(-maxStep, maxStep)
  return Math.max(min, Math.min(max, next))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // station_health already gives us one row per station with its last known values
  const { data: stations, error } = await supabase
    .from('station_health')
    .select('station_id, kind, battery_voltage, water_level, rainfall, temperature, flow_rate')

  if (error || !stations) {
    return NextResponse.json({ error: error?.message ?? 'failed to load stations' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let outageCount = 0

  for (const s of stations) {
    // Simulated outage: skip this cycle entirely — no new row means this station goes stale
    if (Math.random() < OUTAGE_PROBABILITY) {
      outageCount++
      continue
    }

    let battery = s.battery_voltage ?? rand(11.5, 12.6)
    if (battery < LOW_BATTERY_THRESHOLD && Math.random() < BATTERY_REPLACEMENT_PROBABILITY) {
      battery = FRESH_BATTERY_VOLTAGE
    } else {
      battery = Math.max(9.0, battery - rand(0.01, 0.05))
    }

    const water_level = randomWalk(s.water_level ?? rand(0.5, 2.5), 0, 8, 0.3)
    const rainfall = Math.random() < 0.3 ? rand(0, 15) : 0
    const temperature = randomWalk(s.temperature ?? rand(5, 25), -10, 40, 1.5)
    const flow_rate =
      s.kind === 'water_level' ? randomWalk(s.flow_rate ?? rand(10, 100), 0, 500, 15) : null
    const rssi = Math.round(rand(35, 90))

    rows.push({
      station_id: s.station_id,
      recorded_at: now,
      water_level,
      rainfall,
      temperature,
      battery_voltage: Number(battery.toFixed(2)),
      rssi,
      flow_rate,
      is_simulated: true,
    })
  }

  const { error: insertError } = await supabase.from('station_reading').insert(rows)
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    stations_total: stations.length,
    readings_written: rows.length,
    simulated_outages_this_cycle: outageCount,
  })
}