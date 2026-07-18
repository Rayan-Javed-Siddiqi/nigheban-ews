'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function sendDryRunDissemination(alertId: string, districtId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profile')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: channels } = await supabase
    .from('channel_recipient_count')
    .select('channel')
    .eq('district_id', districtId)

  if (!channels || channels.length === 0) {
    throw new Error('No recipient data for this district — cannot dispatch.')
  }

  const rows = channels.map((c) => ({
    alert_id: alertId,
    channel: c.channel,
    recipient: `batch:${c.channel}:demo`,
    district_id: districtId,
    status: 'queued',
  }))

  const { error } = await supabase.from('alert_delivery').insert(rows)
  if (error) throw new Error(error.message)

  await supabase.from('audit_log').insert({
    at: new Date().toISOString(),
    actor: user.id,
    actor_role: profile?.role ?? 'unknown',
    action: 'dissemination_dry_run_started',
    entity: 'alert_candidate',
    entity_id: alertId,
    detail: { channel_count: channels.length, mode: 'dry_run' },
  })

  revalidatePath(`/dashboard/alerts/${alertId}/dissemination`)
}