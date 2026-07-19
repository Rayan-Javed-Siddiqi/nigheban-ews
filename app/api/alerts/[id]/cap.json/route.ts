import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { toCapSeverity } from '@/lib/cap-severity'

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

  // Only issued alerts can be exported as official CAP — drafts must not leak as public output
  if (alert.status !== 'issued') {
    return NextResponse.json({ error: 'Alert is not issued' }, { status: 403 })
  }

  const cap = {
    identifier: alert.id,
    sender: 'nigheban-ews@example.gov.pk',
    sent: alert.issued_at,
    status: 'Actual',
    msgType: 'Alert',
    scope: 'Public',
    info: {
      category: 'Met',
      event: alert.event_en,
      urgency: alert.urgency ? alert.urgency.charAt(0).toUpperCase() + alert.urgency.slice(1) : undefined,
      severity: alert.severity ? toCapSeverity(alert.severity) : undefined,
      certainty: alert.certainty ? alert.certainty.charAt(0).toUpperCase() + alert.certainty.slice(1) : undefined,
      effective: alert.starts_at,
      expires: alert.ends_at,
      senderName: 'Nigheban EWS',
      headline: alert.headline_en,
      description: alert.description,
      instruction: alert.instructions_en,
      area: {
        areaDesc: alert.district ? `${alert.district.name_en}, ${alert.district.province}` : 'Unknown',
      },
    },
    info_ur: {
      event: alert.event_ur,
      headline: alert.headline_ur,
      instruction: alert.instructions_ur,
    },
  }

  return NextResponse.json(cap)
}