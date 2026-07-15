import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: district, error: districtError } = await supabase
    .from('district')
    .select('id, name_en, province, adm2_code, population')
    .eq('id', id)
    .single()

  if (districtError || !district) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }

  const { data: manualReadings } = await supabase
    .from('manual_reading')
    .select('id, source, station_name, reading_type, value, unit, entered_at, notes')
    .eq('district_id', id)
    .order('entered_at', { ascending: false })
    .limit(10)

  const { data: ingestStatus } = await supabase
    .from('ingest_status')
    .select('source, status, last_success_at, last_error')
    .order('source')

  return NextResponse.json({
    district,
    manual_readings: manualReadings ?? [],
    ingest_status: ingestStatus ?? [],
  })
}