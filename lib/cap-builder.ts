import { toCapSeverity } from '@/lib/cap-severity'

export interface CapAlertRecord {
  id: string
  status: string
  event_en: string | null
  event_ur: string | null
  urgency: string | null
  certainty: string | null
  severity: string | null
  headline_en: string | null
  headline_ur: string | null
  description: string | null
  instructions_en: string | null
  instructions_ur: string | null
  starts_at: string | null
  ends_at: string | null
  issued_at: string | null
  geom?: unknown
  district?: { name_en: string; province: string } | null
}

function capCase(value: string | null | undefined): string {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

/** WKT POLYGON or GeoJSON → CAP space-delimited lat,lon pairs */
export function geomToCapPolygon(geom: unknown): string | null {
  if (!geom || typeof geom !== 'object') return null

  const g = geom as { type?: string; coordinates?: unknown }

  if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
    const ring = g.coordinates[0] as [number, number][]
    return ring.map(([lon, lat]) => `${lat},${lon}`).join(' ')
  }

  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates?.[0]?.[0])) {
    const ring = g.coordinates[0][0] as [number, number][]
    return ring.map(([lon, lat]) => `${lat},${lon}`).join(' ')
  }

  return null
}

export function buildCapDocument(alert: CapAlertRecord) {
  const isCancel = alert.status === 'cancelled'
  const areaDesc = alert.district
    ? `${alert.district.name_en}, ${alert.district.province}`
    : 'Unknown'

  const polygon = geomToCapPolygon(alert.geom)

  return {
    identifier: alert.id,
    sender: 'nigheban-ews@example.gov.pk',
    sent: alert.issued_at ?? new Date().toISOString(),
    status: isCancel ? 'Cancel' : 'Actual',
    msgType: isCancel ? 'Cancel' : 'Alert',
    scope: 'Public',
    info: {
      language: 'en',
      category: 'Met',
      event: alert.event_en,
      urgency: capCase(alert.urgency),
      severity: alert.severity ? toCapSeverity(alert.severity) : undefined,
      certainty: capCase(alert.certainty),
      effective: alert.starts_at,
      expires: alert.ends_at,
      senderName: 'Nigheban EWS',
      headline: alert.headline_en,
      description: alert.description,
      instruction: alert.instructions_en,
      area: {
        areaDesc,
        polygon: polygon ?? undefined,
      },
    },
    info_ur: {
      language: 'ur',
      event: alert.event_ur,
      headline: alert.headline_ur,
      instruction: alert.instructions_ur,
      area: { areaDesc },
    },
  }
}

export function buildCapXml(alert: CapAlertRecord): string {
  const cap = buildCapDocument(alert)
  const esc = (v: string | null | undefined) => {
    if (!v) return ''
    return v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const polygonXml = cap.info.area.polygon
    ? `\n      <polygon>${esc(cap.info.area.polygon)}</polygon>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${esc(cap.identifier)}</identifier>
  <sender>${esc(cap.sender)}</sender>
  <sent>${esc(cap.sent)}</sent>
  <status>${cap.status}</status>
  <msgType>${cap.msgType}</msgType>
  <scope>${cap.scope}</scope>
  <info>
    <language>en</language>
    <category>Met</category>
    <event>${esc(cap.info.event ?? '')}</event>
    <urgency>${esc(cap.info.urgency)}</urgency>
    <severity>${esc(cap.info.severity)}</severity>
    <certainty>${esc(cap.info.certainty)}</certainty>
    <effective>${esc(cap.info.effective ?? '')}</effective>
    <expires>${esc(cap.info.expires ?? '')}</expires>
    <senderName>${esc(cap.info.senderName)}</senderName>
    <headline>${esc(cap.info.headline ?? '')}</headline>
    <description>${esc(cap.info.description ?? '')}</description>
    <instruction>${esc(cap.info.instruction ?? '')}</instruction>
    <area>
      <areaDesc>${esc(cap.info.area.areaDesc)}</areaDesc>${polygonXml}
    </area>
  </info>
  <info>
    <language>ur</language>
    <category>Met</category>
    <event>${esc(cap.info_ur.event ?? '')}</event>
    <headline>${esc(cap.info_ur.headline ?? '')}</headline>
    <instruction>${esc(cap.info_ur.instruction ?? '')}</instruction>
    <area>
      <areaDesc>${esc(cap.info_ur.area.areaDesc)}</areaDesc>
    </area>
  </info>
</alert>`
}
