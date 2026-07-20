import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildCapXml } from '@/lib/cap-builder'

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
    return new NextResponse('Alert not found', { status: 404 })
  }

  if (alert.status !== 'issued' && alert.status !== 'cancelled') {
    return new NextResponse('Alert is not issued or cancelled', { status: 403 })
  }

  return new NextResponse(buildCapXml(alert), {
    headers: { 'Content-Type': 'application/xml' },
  })
}
