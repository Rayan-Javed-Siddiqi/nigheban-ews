import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'

const STATUS_FLOW: Record<string, string[]> = {
  pending: ['draft', 'dismissed'],
  draft: ['pending_approval', 'dismissed'],
  pending_approval: ['issued', 'draft', 'cancelled'],
  issued: ['cancelled', 'expired'],
  approved: ['issued'],
  dismissed: [],
  cancelled: [],
  expired: [],
}

async function updateCapFields(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const supabase = await createClient()

  const emptyToNull = (v: FormDataEntryValue | null) => {
    const s = v as string
    return s && s.trim() !== '' ? s : null
  }

  const { error } = await supabase
    .from('alert_candidate')
    .update({
      event_en: formData.get('event_en'),
      event_ur: formData.get('event_ur'),
      urgency: emptyToNull(formData.get('urgency')),
      certainty: emptyToNull(formData.get('certainty')),
      headline_en: formData.get('headline_en'),
      headline_ur: formData.get('headline_ur'),
      instructions_en: formData.get('instructions_en'),
      instructions_ur: formData.get('instructions_ur'),
      severity: formData.get('severity'),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/alerts/${id}`)
}

async function transitionStatus(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const newStatus = formData.get('new_status') as string
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profile')
    .select('role')
    .eq('id', user.id)
    .single()

  // Server-side role enforcement — never trust the client for this
  if (newStatus === 'issued' && profile?.role !== 'duty_officer' && profile?.role !== 'dg') {
    throw new Error('Only a Duty Officer or DG can issue an alert')
  }

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'issued') {
    updates.issued_by = user.id
    updates.issued_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('alert_candidate')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/alerts/${id}`)
}

export default async function AlertComposerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, province)')
    .eq('id', id)
    .single()

  if (!alert) notFound()

  const allowedNext = STATUS_FLOW[alert.status] ?? []
  const inputClass = "w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60"

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href="/dashboard/alerts" className="text-sm text-white/70 hover:text-white">
          ← Alert Review
        </Link>
        <h1 className="text-lg font-semibold text-white">CAP Composer</h1>
        <span className="ml-auto rounded-full bg-white/10 px-3 py-1 font-mono text-xs uppercase text-white">
          {alert.status}
        </span>
      </header>

      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Source
          </h2>
          <p className="text-sm text-[var(--color-ink)]">
            {alert.title} — {alert.district ? `${alert.district.name_en}, ${alert.district.province}` : 'Global'}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/50">
            Metric: {alert.metric_name} · Observed: {alert.observed_value} · Threshold: {alert.threshold_value}
          </p>
        </div>

        <form action={updateCapFields} className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <input type="hidden" name="id" value={alert.id} />

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
              <select name="severity" defaultValue={alert.severity ?? ''} className={inputClass}>
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="extreme">Extreme</option>
                <option value="warning">Warning</option>
                <option value="watch">Watch</option>
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

          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-white hover:bg-[var(--color-primary-hover)]">
            Save CAP Fields
          </button>
        </form>

        {allowedNext.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
              Workflow
            </h2>
            <div className="flex flex-wrap gap-3">
              {allowedNext.map((next) => (
                <form action={transitionStatus} key={next}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="new_status" value={next} />
                  <button
                    type="submit"
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                      next === 'issued' ? 'bg-[var(--color-emergency)] hover:bg-red-700' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
                    }`}
                  >
                    Move to {next.replace('_', ' ')}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}

        {alert.status === 'issued' && (
          <div className="flex gap-3">
            
              <a href={`/api/alerts/${alert.id}/cap.json`}
              target="_blank"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
            >
              View CAP JSON
            </a>
            
              <a href={`/api/alerts/${alert.id}/cap.xml`}
              target="_blank"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
            >
              View CAP XML
            </a>
          </div>
        )}
      </div>
    </div>
  )
}