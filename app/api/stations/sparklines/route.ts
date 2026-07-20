import { createClient } from '@/lib/supabase/server'
import { bucketHourlyCounts } from '@/lib/station-health'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('station_reading')
    .select('station_id, recorded_at')
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sparklines = bucketHourlyCounts(data ?? [])
  return NextResponse.json(sparklines)
}
