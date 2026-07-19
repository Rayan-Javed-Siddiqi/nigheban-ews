import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { toCapSeverity } from '@/lib/cap-severity'

function escapeXml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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

  if (alert.status !== 'issued') {
    return new NextResponse('Alert is not issued', { status: 403 })
  }

  const areaDesc = alert.district ? `${alert.district.name_en}, ${alert.district.province}` : 'Unknown'
  const severity = alert.severity ? toCapSeverity(alert.severity) : ''
  const urgency = alert.urgency ? alert.urgency.charAt(0).toUpperCase() + alert.urgency.slice(1) : ''
  const certainty = alert.certainty ? alert.certainty.charAt(0).toUpperCase() + alert.certainty.slice(1) : ''

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${escapeXml(alert.id)}</identifier>
  <sender>nigheban-ews@example.gov.pk</sender>
  <sent>${escapeXml(alert.issued_at)}</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <info>
    <language>en</language>
    <category>Met</category>
    <event>${escapeXml(alert.event_en)}</event>
    <urgency>${urgency}</urgency>
    <severity>${severity}</severity>
    <certainty>${certainty}</certainty>
    <effective>${escapeXml(alert.starts_at)}</effective>
    <expires>${escapeXml(alert.ends_at)}</expires>
    <senderName>Nigheban EWS</senderName>
    <headline>${escapeXml(alert.headline_en)}</headline>
    <description>${escapeXml(alert.description)}</description>
    <instruction>${escapeXml(alert.instructions_en)}</instruction>
    <area>
      <areaDesc>${escapeXml(areaDesc)}</areaDesc>
    </area>
  </info>
  <info>
    <language>ur</language>
    <category>Met</category>
    <event>${escapeXml(alert.event_ur)}</event>
    <headline>${escapeXml(alert.headline_ur)}</headline>
    <instruction>${escapeXml(alert.instructions_ur)}</instruction>
    <area>
      <areaDesc>${escapeXml(areaDesc)}</areaDesc>
    </area>
  </info>
</alert>`

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}