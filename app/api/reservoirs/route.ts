import { createClient } from '@/lib/supabase/server'
import { fetchIrsaReservoirPdf, type ReservoirRow } from '@/lib/ingest/irsa-fetch'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reservoir_reading')
    .select('*')
    .order('reading_date', { ascending: false })
    .limit(3)

  if (!error && data && data.length > 0) {
    return NextResponse.json({ source: 'database', readings: data })
  }

  try {
    const live = await fetchIrsaReservoirPdf()
    return NextResponse.json({ source: 'live_pdf', readings: live })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (error) {
      return NextResponse.json(
        { error: message, db_error: error.message, readings: [] as ReservoirRow[] },
        { status: 502 }
      )
    }
    return NextResponse.json({ error: message, readings: [] }, { status: 502 })
  }
}
