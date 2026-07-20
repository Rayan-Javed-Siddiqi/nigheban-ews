/** Twilio Programmable Messaging — SMS and WhatsApp helpers. */

export type TwilioChannel = 'sms' | 'whatsapp'

export interface TwilioCredentials {
  accountSid: string
  authToken: string
}

export interface TwilioSendParams {
  credentials: TwilioCredentials
  channel: TwilioChannel
  from: string
  to: string
  body?: string
  /** Approved WhatsApp template SID (Content Template Builder). */
  contentSid?: string
  contentVariables?: Record<string, string>
}

export interface TwilioSendResult {
  sid: string
  status: string
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} in environment`)
  return value
}

/** E.164 or whatsapp:+E164 → whatsapp:+E164 */
export function normalizeWhatsAppAddress(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('whatsapp:')) return trimmed
  const digits = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`
  return `whatsapp:${digits}`
}

/** E.164 for SMS (no whatsapp: prefix). */
export function normalizeSmsAddress(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('whatsapp:')) return trimmed.slice('whatsapp:'.length)
  return trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`
}

export function getTwilioCredentials(): TwilioCredentials {
  return {
    accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    authToken: requireEnv('TWILIO_AUTH_TOKEN'),
  }
}

export function isTwilioSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.TWILIO_TO_NUMBER
  )
}

export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM &&
    process.env.TWILIO_WHATSAPP_TO
  )
}

export function getWhatsAppFrom(): string {
  return normalizeWhatsAppAddress(requireEnv('TWILIO_WHATSAPP_FROM'))
}

export function getWhatsAppTo(): string {
  return normalizeWhatsAppAddress(requireEnv('TWILIO_WHATSAPP_TO'))
}

export async function sendTwilioMessage(params: TwilioSendParams): Promise<TwilioSendResult> {
  const { credentials, channel, from, to, body, contentSid, contentVariables } = params

  const fromAddr = channel === 'whatsapp' ? normalizeWhatsAppAddress(from) : normalizeSmsAddress(from)
  const toAddr = channel === 'whatsapp' ? normalizeWhatsAppAddress(to) : normalizeSmsAddress(to)

  const payload = new URLSearchParams({ From: fromAddr, To: toAddr })

  if (contentSid) {
    payload.set('ContentSid', contentSid)
    if (contentVariables && Object.keys(contentVariables).length > 0) {
      payload.set('ContentVariables', JSON.stringify(contentVariables))
    }
  } else if (body) {
    payload.set('Body', body)
  } else {
    throw new Error('Twilio message requires Body or ContentSid')
  }

  const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Twilio ${channel} send failed: ${errText}`)
  }

  const data = (await res.json()) as { sid: string; status: string }
  return { sid: data.sid, status: data.status }
}
