'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { activateDryRunDispatch, fanOutAlert } from '@/lib/dissemination-fanout'
import { buildSmsBody } from '@/lib/dissemination'
import { logAudit } from '@/lib/audit'
import {
  getTwilioCredentials,
  getWhatsAppFrom,
  getWhatsAppTo,
  isTwilioSmsConfigured,
  isTwilioWhatsAppConfigured,
  normalizeSmsAddress,
  sendTwilioMessage,
  type TwilioChannel,
} from '@/lib/twilio'

async function assertStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  if (profile?.role !== 'duty_officer' && profile?.role !== 'dg') {
    throw new Error('Only duty officers or DG can dispatch alerts')
  }
  return { user, profile }
}

export async function fanOutOnIssue(alertId: string, districtId: string | null, locale = 'en') {
  const supabase = await createClient()
  const { user, profile } = await assertStaff(supabase)

  const result = await fanOutAlert(supabase, alertId, districtId, 'dry_run')

  if (result.rowsCreated > 0) {
    await logAudit(supabase, {
      actor: user.id,
      actor_role: profile?.role ?? 'unknown',
      action: 'dissemination_fanout_on_issue',
      entity: 'alert_candidate',
      entity_id: alertId,
      detail: { mode: 'dry_run', rows: result.rowsCreated, channels: result.channels },
    })
  }

  revalidatePath(`/${locale}/dashboard/alerts/${alertId}`)
  revalidatePath(`/${locale}/dashboard/alerts/${alertId}/dissemination`)
  return result
}

export async function executeDryRunDispatch(alertId: string, districtId: string, locale = 'en') {
  const supabase = await createClient()
  const { user, profile } = await assertStaff(supabase)

  await fanOutAlert(supabase, alertId, districtId, 'dry_run')
  const activated = await activateDryRunDispatch(supabase, alertId)

  await logAudit(supabase, {
    actor: user.id,
    actor_role: profile?.role ?? 'unknown',
    action: 'dissemination_dry_run_started',
    entity: 'alert_candidate',
    entity_id: alertId,
    detail: { activated, mode: 'dry_run' },
  })

  revalidatePath(`/${locale}/dashboard/alerts/${alertId}/dissemination`)
}

async function markChannelSent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  alertId: string,
  channel: TwilioChannel
) {
  const { data: row } = await supabase
    .from('alert_delivery')
    .select('id')
    .eq('alert_id', alertId)
    .eq('channel', channel)
    .limit(1)
    .maybeSingle()

  if (row) {
    await supabase
      .from('alert_delivery')
      .update({ status: 'sent', status_at: new Date().toISOString() })
      .eq('id', row.id)
  }
}

/** Send one live message via Twilio SMS or WhatsApp sandbox. */
export async function executeLiveDispatch(
  alertId: string,
  districtId: string,
  locale = 'en',
  channel: TwilioChannel = 'sms'
) {
  const supabase = await createClient()
  const { user, profile } = await assertStaff(supabase)

  if (channel === 'sms' && !isTwilioSmsConfigured()) {
    throw new Error('Twilio SMS not configured — set TWILIO_FROM_NUMBER and TWILIO_TO_NUMBER in .env.local')
  }
  if (channel === 'whatsapp' && !isTwilioWhatsAppConfigured()) {
    throw new Error(
      'Twilio WhatsApp not configured — set TWILIO_WHATSAPP_FROM and TWILIO_WHATSAPP_TO in .env.local'
    )
  }

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('headline_en, event_en, instructions_en, severity')
    .eq('id', alertId)
    .single()

  if (!alert) throw new Error('Alert not found')

  const body = buildSmsBody(alert, 'en').slice(0, channel === 'whatsapp' ? 4096 : 1600)
  const credentials = getTwilioCredentials()
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim()

  const sendParams =
    channel === 'whatsapp'
      ? {
          credentials,
          channel: 'whatsapp' as const,
          from: getWhatsAppFrom(),
          to: getWhatsAppTo(),
          ...(contentSid ? { contentSid, contentVariables: { '1': body } } : { body }),
        }
      : {
          credentials,
          channel: 'sms' as const,
          from: normalizeSmsAddress(process.env.TWILIO_FROM_NUMBER!),
          to: normalizeSmsAddress(process.env.TWILIO_TO_NUMBER!),
          body,
        }

  const result = await sendTwilioMessage(sendParams)

  await fanOutAlert(supabase, alertId, districtId, 'live')
  await markChannelSent(supabase, alertId, channel)

  await logAudit(supabase, {
    actor: user.id,
    actor_role: profile?.role ?? 'unknown',
    action: channel === 'whatsapp' ? 'dissemination_live_whatsapp' : 'dissemination_live_sms',
    entity: 'alert_candidate',
    entity_id: alertId,
    detail: {
      mode: 'live',
      channel,
      twilio_sid: result.sid,
      twilio_status: result.status,
      to: channel === 'whatsapp' ? getWhatsAppTo() : process.env.TWILIO_TO_NUMBER,
      used_template: Boolean(contentSid),
      body_chars: body.length,
    },
  })

  revalidatePath(`/${locale}/dashboard/alerts/${alertId}/dissemination`)
}

/** @deprecated use executeDryRunDispatch */
export async function sendDryRunDissemination(alertId: string, districtId: string) {
  return executeDryRunDispatch(alertId, districtId, 'en')
}
