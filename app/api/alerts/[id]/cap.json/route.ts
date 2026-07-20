import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildCapDocument } from '@/lib/cap-builder'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, province)')
    .eq('id', id)
    .single()

  if (!alert) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }

  if (alert.status !== 'issued' && alert.status !== 'cancelled') {
    return NextResponse.json({ error: 'Alert is not issued or cancelled' }, { status: 403 })
  }

  return NextResponse.json(buildCapDocument(alert))
}
