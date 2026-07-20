import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import PrintButton from './PrintButton'
import AuditTimeline from './AuditTimeline'
import { logAudit, type AuditLogRow } from '@/lib/audit'
import { z } from 'zod'
import {
  getAllowedTransitions,
  canEscalate,
  canTransition,
  escalateSeverity,
  workflowButtonLabel,
  type AppRole,
} from '@/lib/alert-workflow'

const CAPSchema = z.object({
  event_en: z.string().min(1, 'English event name is required'),
  event_ur: z.string().optional().nullable(),
  urgency: z.enum(['immediate', 'expected', 'future', 'past']).nullable(),
  certainty: z.enum(['observed', 'likely', 'possible', 'unlikely']).nullable(),
  headline_en: z.string().optional().nullable(),
  headline_ur: z.string().optional().nullable(),
  instructions_en: z.string().optional().nullable(),
  instructions_ur: z.string().optional().nullable(),
  severity: z.enum(['emergency', 'warning', 'watch', 'advisory']),
})

async function updateCapFields(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()

  const emptyToNull = (v: FormDataEntryValue | null) => {
    const s = v as string
    return s && s.trim() !== '' ? s : null
  }

  const rawData = {
    event_en: formData.get('event_en'),
    event_ur: formData.get('event_ur'),
    urgency: emptyToNull(formData.get('urgency')),
    certainty: emptyToNull(formData.get('certainty')),
    headline_en: formData.get('headline_en'),
    headline_ur: formData.get('headline_ur'),
    instructions_en: formData.get('instructions_en'),
    instructions_ur: formData.get('instructions_ur'),
    severity: formData.get('severity'),
  }

  const parsedData = CAPSchema.safeParse(rawData)
  if (!parsedData.success) {
    throw new Error(`Validation failed: ${parsedData.error.message}`)
  }

  const { error } = await supabase.from('alert_candidate').update(parsedData.data).eq('id', id)
  if (error) throw new Error(error.message)

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
    await logAudit(supabase, {
      action: 'edit_cap_fields',
      entity: 'alert_candidate',
      entity_id: id,
      actor: user.id,
      actor_role: profile?.role || 'viewer',
    })
  }

  revalidatePath(`/${locale}/dashboard/alerts/${id}`)
}

async function transitionStatus(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const newStatus = formData.get('new_status') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  const role = profile?.role as AppRole | undefined

  const { data: current } = await supabase.from('alert_candidate').select('status').eq('id', id).single()
  if (!current) throw new Error('Alert not found')

  if (!canTransition(role, current.status, newStatus)) {
    throw new Error(`Role ${role ?? 'unknown'} cannot move ${current.status} → ${newStatus}`)
  }

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'issued') {
    updates.issued_by = user.id
    updates.issued_at = new Date().toISOString()
  }

  const { error } = await supabase.from('alert_candidate').update(updates).eq('id', id)
  if (error) throw new Error(error.message)

  if (newStatus === 'issued') {
    const { data: alertRow } = await supabase
      .from('alert_candidate')
      .select('district_id')
      .eq('id', id)
      .single()
    if (alertRow?.district_id) {
      const { fanOutOnIssue } = await import('./dissemination-actions')
      await fanOutOnIssue(id, alertRow.district_id, locale)
    }
  }

  revalidatePath(`/${locale}/dashboard/alerts/${id}`)
  revalidatePath(`/${locale}/dashboard/alerts`)
}

async function escalateAlertSeverity(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  const role = profile?.role as AppRole | undefined

  const { data: alert } = await supabase.from('alert_candidate').select('severity, status').eq('id', id).single()
  if (!alert) throw new Error('Alert not found')
  if (!canEscalate(role, alert.status)) throw new Error('Cannot escalate in current state')

  const next = escalateSeverity(alert.severity)
  if (!next) throw new Error('Already at maximum severity')

  const { error } = await supabase.from('alert_candidate').update({ severity: next }).eq('id', id)
  if (error) throw new Error(error.message)

  await logAudit(supabase, {
    action: 'escalate_severity',
    entity: 'alert_candidate',
    entity_id: id,
    actor: user.id,
    actor_role: profile?.role || 'viewer',
    detail: { from: alert.severity, to: next },
  })

  revalidatePath(`/${locale}/dashboard/alerts/${id}`)
}

export default async function AlertComposerPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id, locale } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  const role = profile?.role as AppRole | undefined

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, province)')
    .eq('id', id)
    .single()

  if (!alert) notFound()

  const { data: auditLogs } = await supabase
    .from('audit_log')
    .select('*')
    .eq('entity_id', id)
    .order('at', { ascending: true })

  let deliveryStats: {
    total: number
    queued: number
    sent: number
    delivered: number
    failed: number
    acknowledged: number
    ackRate: number
  } | null = null
  if (alert.status === 'issued' || alert.status === 'cancelled') {
    const { data: deliveries } = await supabase.from('alert_delivery').select('status').eq('alert_id', id)
    if (deliveries && deliveries.length > 0) {
      const acknowledged = deliveries.filter((d) => d.status === 'acknowledged').length
      deliveryStats = {
        total: deliveries.length,
        queued: deliveries.filter((d) => d.status === 'queued').length,
        sent: deliveries.filter((d) => d.status === 'sent').length,
        delivered: deliveries.filter((d) => d.status === 'delivered').length,
        failed: deliveries.filter((d) => d.status === 'failed').length,
        acknowledged,
        ackRate: Math.round((acknowledged / deliveries.length) * 100),
      }
    }
  }

  const actorIds = [...new Set((auditLogs ?? []).map((l) => l.actor).filter(Boolean))] as string[]
  const actorNames: Record<string, string> = {}
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from('profile').select('id, full_name').in('id', actorIds)
    for (const a of actors ?? []) {
      if (a.full_name) actorNames[a.id] = a.full_name
    }
  }

  const allowedNext = getAllowedTransitions(role, alert.status)
  const primaryAction = allowedNext.find((s) => s === 'issued') ?? allowedNext[0]
  const secondaryActions = allowedNext.filter((s) => s !== primaryAction)
  const nextSeverity = escalateSeverity(alert.severity)
  const showEscalate = canEscalate(role, alert.status) && nextSeverity !== null

  const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm'
  const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60'
  const capExportable = alert.status === 'issued' || alert.status === 'cancelled'

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="print:hidden flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard/alerts`} className="text-sm text-white/70 hover:text-white">
          ← Alert Review
        </Link>
        <h1 className="text-lg font-semibold text-white">CAP Composer</h1>
        <span className="ml-4 rounded-full bg-white/10 px-3 py-1 font-mono text-xs uppercase text-white">
          {alert.status}
        </span>
        {role && (
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs uppercase text-white/70">
            {role.replace('_', ' ')}
          </span>
        )}
        <PrintButton alertId={alert.id} locale={locale} disabled={!capExportable} />
      </header>

      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Source</h2>
          <p className="text-sm text-[var(--color-ink)]">
            {alert.title} — {alert.district ? `${alert.district.name_en}, ${alert.district.province}` : 'Global'}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/50">
            Metric: {alert.metric_name} · Observed: {alert.observed_value} · Threshold: {alert.threshold_value}
          </p>
          {alert.event_en && (
            <p className="mt-2 text-xs text-[var(--color-ink)]/60">
              CAP pre-filled: {alert.event_en}
              {alert.urgency ? ` · urgency ${alert.urgency}` : ''}
            </p>
          )}
        </div>

        <form action={updateCapFields} className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <input type="hidden" name="id" value={alert.id} />
          <input type="hidden" name="locale" value={locale} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Event (English)</label>
              <input name="event_en" defaultValue={alert.event_en ?? ''} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Event (Urdu)</label>
              <input name="event_ur" defaultValue={alert.event_ur ?? ''} dir="rtl" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Severity</label>
              <select name="severity" defaultValue={alert.severity ?? ''} className={inputClass} required>
                <option value="advisory">Advisory</option>
                <option value="watch">Watch</option>
                <option value="warning">Warning</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Urgency</label>
              <select name="urgency" defaultValue={alert.urgency ?? ''} className={inputClass}>
                <option value="">—</option>
                <option value="immediate">Immediate</option>
                <option value="expected">Expected</option>
                <option value="future">Future</option>
                <option value="past">Past</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Certainty</label>
              <select name="certainty" defaultValue={alert.certainty ?? ''} className={inputClass}>
                <option value="">—</option>
                <option value="observed">Observed</option>
                <option value="likely">Likely</option>
                <option value="possible">Possible</option>
                <option value="unlikely">Unlikely</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Headline (English)</label>
              <input name="headline_en" defaultValue={alert.headline_en ?? alert.title ?? ''} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Headline (Urdu)</label>
              <input name="headline_ur" defaultValue={alert.headline_ur ?? ''} dir="rtl" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Instructions (English)</label>
              <textarea name="instructions_en" defaultValue={alert.instructions_en ?? ''} rows={4} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Instructions (Urdu)</label>
              <textarea name="instructions_ur" defaultValue={alert.instructions_ur ?? ''} dir="rtl" rows={4} className={inputClass} />
            </div>
          </div>

          {(role === 'duty_officer' || role === 'dg') && (
            <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-white hover:bg-[var(--color-primary-hover)]">
              Save CAP Fields
            </button>
          )}
        </form>

        {(allowedNext.length > 0 || showEscalate) && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Workflow</h2>
            {alert.status === 'pending_approval' && role === 'dg' && (
              <p className="mb-3 text-sm text-[var(--color-ink)]/70">
                This alert is ready for your approval. Click <strong>Issue alert</strong> to publish the CAP warning.
              </p>
            )}
            {alert.status === 'pending_approval' && role !== 'dg' && (
              <p className="mb-3 text-sm text-amber-800">
                Submitted for DG approval. Your role is <strong>{role ?? 'unknown'}</strong> — only DG can issue.
              </p>
            )}
            {alert.status === 'draft' && role === 'dg' && (
              <p className="mb-3 text-sm text-[var(--color-ink)]/70">
                As DG you can <strong>Issue alert</strong> directly, or submit for approval if another DG must sign off.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {primaryAction && (
                <form action={transitionStatus}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="new_status" value={primaryAction} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                      primaryAction === 'issued'
                        ? 'bg-[var(--color-emergency)] hover:bg-red-700'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
                    }`}
                  >
                    {workflowButtonLabel(alert.status, primaryAction)}
                  </button>
                </form>
              )}
              {secondaryActions.map((next) => (
                <form action={transitionStatus} key={next}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="new_status" value={next} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className={`rounded-md px-4 py-2 text-sm font-semibold shadow-sm ${
                      next === 'cancelled' || next === 'dismissed'
                        ? 'border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-border)]'
                        : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                    }`}
                  >
                    {workflowButtonLabel(alert.status, next)}
                  </button>
                </form>
              ))}
              {showEscalate && (
                <form action={escalateAlertSeverity}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="rounded-md border-2 border-[var(--color-emergency)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-emergency)] hover:bg-[var(--color-emergency)]/10"
                  >
                    Escalate to {nextSeverity}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {capExportable && (
          <div className="flex flex-wrap gap-3">
            {alert.status === 'issued' && (
              <Link
                href={`/${locale}/dashboard/alerts/${alert.id}/dissemination`}
                className="rounded-md bg-[var(--color-emergency)] px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Dissemination Board
              </Link>
            )}
            <a
              href={`/api/alerts/${alert.id}/cap.json`}
              target="_blank"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
            >
              View CAP JSON
            </a>
            <a
              href={`/api/alerts/${alert.id}/cap.xml`}
              target="_blank"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
            >
              View CAP XML{alert.status === 'cancelled' ? ' (Cancel)' : ''}
            </a>
          </div>
        )}

        {(alert.status === 'issued' || alert.status === 'cancelled') && deliveryStats && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
              Delivery &amp; Acknowledgement Statistics
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                ['Dispatched', deliveryStats.total, 'text-[var(--color-ink)]'],
                ['In Transit', deliveryStats.queued + deliveryStats.sent, 'text-[var(--color-ink)]'],
                ['Delivered', deliveryStats.delivered, 'text-green-600'],
                ['Acknowledged', deliveryStats.acknowledged, 'text-[var(--color-primary)]'],
                ['Failed', deliveryStats.failed, 'text-red-600'],
              ].map(([label, val, cls]) => (
                <div key={label as string} className="rounded border border-[var(--color-border)] bg-white p-3 text-center shadow-sm">
                  <div className={`text-2xl font-mono font-bold ${cls}`}>{val as number}</div>
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink)]/50">{label as string}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {auditLogs && auditLogs.length > 0 && (
          <AuditTimeline
            logs={auditLogs as AuditLogRow[]}
            actorNames={actorNames}
            locale={locale}
            deliveryStats={deliveryStats}
          />
        )}
      </div>
    </div>
  )
}
