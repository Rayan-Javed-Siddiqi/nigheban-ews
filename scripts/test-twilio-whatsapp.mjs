import fs from 'fs'
import path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

function wa(n) {
  const v = n.trim()
  return v.startsWith('whatsapp:') ? v : `whatsapp:${v.startsWith('+') ? v : `+${v}`}`
}

const sid = process.env.TWILIO_ACCOUNT_SID ?? env.TWILIO_ACCOUNT_SID
const token = process.env.TWILIO_AUTH_TOKEN ?? env.TWILIO_AUTH_TOKEN
const from = process.env.TWILIO_WHATSAPP_FROM ?? env.TWILIO_WHATSAPP_FROM
const to = process.env.TWILIO_WHATSAPP_TO ?? env.TWILIO_WHATSAPP_TO

if (!sid || !token || !from || !to) {
  console.error('Missing WhatsApp Twilio env vars in .env.local')
  process.exit(1)
}

const body = `Nigheban EWS test — WhatsApp is wired. Sent ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} PKT.`

const auth = Buffer.from(`${sid}:${token}`).toString('base64')
const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    From: wa(from),
    To: wa(to),
    Body: body,
  }),
})

const data = await res.json().catch(async () => ({ raw: await res.text() }))
if (!res.ok) {
  console.error('FAILED', res.status, JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log('OK', { sid: data.sid, status: data.status, to: data.to, from: data.from })
