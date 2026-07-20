/** Build outbound SMS/WA text from an issued alert candidate. */
export function buildSmsBody(alert: {
  headline_en?: string | null
  event_en?: string | null
  instructions_en?: string | null
  headline_ur?: string | null
  event_ur?: string | null
  instructions_ur?: string | null
  severity?: string | null
}, lang: 'en' | 'ur'): string {
  if (lang === 'ur') {
    const headline = alert.headline_ur || alert.event_ur || 'انتباہ'
    const body = alert.instructions_ur || ''
    return body ? `${headline}\n${body}` : headline
  }
  const headline = alert.headline_en || alert.event_en || 'ALERT'
  const body = alert.instructions_en || ''
  const prefix = alert.severity === 'emergency' ? 'URGENT: ' : ''
  return body ? `${prefix}${headline}\n${body}` : `${prefix}${headline}`
}

function isUnicodeText(text: string): boolean {
  return /[^\u0000-\u007F]/.test(text)
}

export interface SmsSegmentInfo {
  text: string
  segments: string[]
  charCount: number
  segmentCount: number
  encoding: 'GSM-7' | 'UCS-2'
  singleLimit: number
  multipartLimit: number
}

/** Split SMS for preview (GSM-7: 160/153, Unicode/Urdu: 70/67). */
export function segmentSms(text: string): SmsSegmentInfo {
  const unicode = isUnicodeText(text)
  const singleLimit = unicode ? 70 : 160
  const multipartLimit = unicode ? 67 : 153
  const encoding = unicode ? 'UCS-2' : 'GSM-7'

  if (text.length <= singleLimit) {
    return {
      text,
      segments: [text],
      charCount: text.length,
      segmentCount: 1,
      encoding,
      singleLimit,
      multipartLimit,
    }
  }

  const segments: string[] = []
  let i = 0
  while (i < text.length) {
    segments.push(text.slice(i, i + multipartLimit))
    i += multipartLimit
  }

  return {
    text,
    segments,
    charCount: text.length,
    segmentCount: segments.length,
    encoding,
    singleLimit,
    multipartLimit,
  }
}

export const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  app_push: 'App Push',
  siren: 'Siren',
  loudspeaker: 'Loudspeaker',
}

export type DispatchMode = 'dry_run' | 'live'
