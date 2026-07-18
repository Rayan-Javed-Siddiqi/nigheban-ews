import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Simple state machine: queued -> sent -> (delivered | failed) -> acknowledged
// failed is terminal. acknowledged is terminal. Only delivered rows can become acknowledged.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: alertId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: rows } = await supabase
    .from('alert_delivery')
    .select('id, channel, status')
    .eq('alert_id', alertId)
    .in('status', ['queued', 'sent', 'delivered'])

  if (!rows || rows.length === 0) {
    return NextResponse.json({ advanced: 0, done: true })
  }

  const now = new Date().toISOString()
  const updates: { id: string; status: string; extra: Record<string, unknown> }[] = []

  for (const row of rows) {
    // Not every tick advances every row — gives it a "trickling in" feel instead of lockstep.
    if (Math.random() > 0.6) continue

    if (row.status === 'queued') {
      updates.push({ id: row.id, status: 'sent', extra: {} })
    } else if (row.status === 'sent') {
      // 85% delivered, 15% failed — siren/loudspeaker are physical so bias them toward delivered
      const failChance = row.channel === 'siren' || row.channel === 'loudspeaker' ? 0.05 : 0.15
      const nextStatus = Math.random() < failChance ? 'failed' : 'delivered'
      updates.push({ id: row.id, status: nextStatus, extra: {} })
    } else if (row.status === 'delivered') {
      // Only some delivered messages get acknowledged (a human has to actually respond)
      if (Math.random() < 0.5) {
        updates.push({
          id: row.id,
          status: 'acknowledged',
          extra: { ack_at: now, ack_by: 'demo-field-response' },
        })
      }
    }
  }

  for (const u of updates) {
    await supabase
      .from('alert_delivery')
      .update({ status: u.status, status_at: now, ...u.extra })
      .eq('id', u.id)
  }

  return NextResponse.json({ advanced: updates.length, remaining: rows.length - updates.length })
}