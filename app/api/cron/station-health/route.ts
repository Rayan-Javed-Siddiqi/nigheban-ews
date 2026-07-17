// app/api/cron/station-health/route.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const OFFLINE_TICKET_THRESHOLD_HOURS = 24

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: health, error: healthError } = await supabase
    .from('station_health')
    .select('station_id, last_transmission_at, status')

  if (healthError || !health) {
    return NextResponse.json({ error: healthError?.message ?? 'failed to load station_health' }, { status: 500 })
  }

  const now = Date.now()
  const staleStations = health.filter((s) => {
    if (!s.last_transmission_at) return true
    const ageHours = (now - new Date(s.last_transmission_at).getTime()) / (1000 * 60 * 60)
    return ageHours > OFFLINE_TICKET_THRESHOLD_HOURS
  })

  const { data: openTickets } = await supabase
    .from('maintenance_ticket')
    .select('station_id')
    .eq('status', 'open')

  const openStationIds = new Set((openTickets ?? []).map((t) => t.station_id))

  const toCreate = staleStations
    .filter((s) => !openStationIds.has(s.station_id))
    .map((s) => ({
      station_id: s.station_id,
      reason: `Station offline for more than ${OFFLINE_TICKET_THRESHOLD_HOURS} hours (no telemetry received)`,
      status: 'open',
    }))

  let created = 0
  if (toCreate.length > 0) {
    const { error: insertError } = await supabase.from('maintenance_ticket').insert(toCreate)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    created = toCreate.length
  }

  // Auto-resolve: station is reporting again (not offline) and has an open ticket → close it
  const recoveredStationIds = health
    .filter((s) => s.status !== 'offline' && openStationIds.has(s.station_id))
    .map((s) => s.station_id)

  let resolved = 0
  if (recoveredStationIds.length > 0) {
    const { data: resolvedRows, error: resolveError } = await supabase
      .from('maintenance_ticket')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .in('station_id', recoveredStationIds)
      .eq('status', 'open')
      .select('id')

    if (resolveError) {
      return NextResponse.json({ error: resolveError.message }, { status: 500 })
    }
    resolved = resolvedRows?.length ?? 0
  }

  return NextResponse.json({
    ok: true,
    stations_checked: health.length,
    stations_offline_24h_plus: staleStations.length,
    tickets_created: created,
    tickets_auto_resolved: resolved,
  })
}