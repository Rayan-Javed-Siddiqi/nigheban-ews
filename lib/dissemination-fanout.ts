import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSmsBody, type DispatchMode } from '@/lib/dissemination'

export interface FanOutResult {
  rowsCreated: number
  channels: string[]
  mode: DispatchMode
}

/** Create alert_delivery rows for each channel (+ focal contacts for SMS). */
export async function fanOutAlert(
  supabase: SupabaseClient,
  alertId: string,
  districtId: string | null,
  mode: DispatchMode = 'dry_run'
): Promise<FanOutResult> {
  if (!districtId) {
    throw new Error('Alert has no district — cannot fan out dissemination.')
  }

  const { data: existing } = await supabase
    .from('alert_delivery')
    .select('id')
    .eq('alert_id', alertId)
    .limit(1)

  if (existing && existing.length > 0) {
    const { data: channels } = await supabase
      .from('alert_delivery')
      .select('channel')
      .eq('alert_id', alertId)
    return {
      rowsCreated: 0,
      channels: (channels ?? []).map((c) => c.channel),
      mode,
    }
  }

  const [{ data: channelCounts }, { data: contacts }, { data: alert }] = await Promise.all([
    supabase.from('channel_recipient_count').select('channel, recipient_count').eq('district_id', districtId),
    supabase.from('district_contact').select('id, role_title, phone_placeholder').eq('district_id', districtId),
    supabase
      .from('alert_candidate')
      .select('headline_en, event_en, instructions_en, headline_ur, event_ur, instructions_ur, severity')
      .eq('id', alertId)
      .single(),
  ])

  if (!channelCounts || channelCounts.length === 0) {
    throw new Error('No recipient channel data for this district.')
  }

  const initialStatus = mode === 'live' ? 'queued' : 'dry_run'
  const rows: Record<string, unknown>[] = []

  for (const c of channelCounts) {
    rows.push({
      alert_id: alertId,
      channel: c.channel,
      recipient: `batch:${c.channel}:${districtId.slice(0, 8)}`,
      district_id: districtId,
      status: initialStatus,
    })
  }

  // Individual SMS rows for district focal contacts (demo roster)
  if (alert && contacts && contacts.length > 0) {
    const smsBody = buildSmsBody(alert, 'en').slice(0, 160)
    for (const contact of contacts.slice(0, 5)) {
      rows.push({
        alert_id: alertId,
        channel: 'sms',
        recipient: contact.phone_placeholder,
        district_id: districtId,
        status: initialStatus,
      })
    }
    void smsBody // reserved for Twilio live body
  }

  const { error } = await supabase.from('alert_delivery').insert(rows)
  if (error) throw new Error(error.message)

  return {
    rowsCreated: rows.length,
    channels: channelCounts.map((c) => c.channel),
    mode,
  }
}

/** dry_run → queued so ack simulation can advance delivery states. */
export async function activateDryRunDispatch(
  supabase: SupabaseClient,
  alertId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('alert_delivery')
    .update({ status: 'queued', status_at: new Date().toISOString() })
    .eq('alert_id', alertId)
    .eq('status', 'dry_run')
    .select('id')

  if (error) throw new Error(error.message)
  return data?.length ?? 0
}
