import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { sendDryRunDissemination } from '../dissemination-actions'
import AckSimulator from './ack-simulator'

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  app_push: 'App Push',
  siren: 'Siren',
  loudspeaker: 'Loudspeaker',
}

export default async function DisseminationBoardPage({
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
    .select('*, district:district_id(id, name_en, province)')
    .eq('id', id)
    .single()

  if (!alert) notFound()
  if (alert.status !== 'issued') {
    redirect(`/dashboard/alerts/${id}`)
  }

  const districtId = alert.district?.id ?? alert.district_id

  const [{ data: recipientCounts }, { data: deliveries }] = await Promise.all([
    supabase
      .from('channel_recipient_count')
      .select('channel, recipient_count')
      .eq('district_id', districtId),
    supabase
      .from('alert_delivery')
      .select('id, channel, status, status_at, ack_at')
      .eq('alert_id', id),
  ])

  const alreadyDispatched = (deliveries?.length ?? 0) > 0
  const totalRecipients = (recipientCounts ?? []).reduce((sum, c) => sum + c.recipient_count, 0)

  const sectionClass = "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
  const headingClass = "mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60"

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/dashboard/alerts/${id}`} className="text-sm text-white/70 hover:text-white">
          {'<-'} CAP Composer
        </Link>
        <h1 className="text-lg font-semibold text-white">Dissemination Board</h1>
        <span className="ml-auto rounded-full bg-white/10 px-3 py-1 font-mono text-xs uppercase text-white">
          {alert.status}
        </span>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 p-6">

        {/* Alert summary */}
        <div className={sectionClass}>
          <h2 className={headingClass}>Issuing</h2>
          <p className="text-sm text-[var(--color-ink)]">
            {alert.headline_en || alert.title} - {alert.district ? `${alert.district.name_en}, ${alert.district.province}` : 'Global'}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/50">
            Severity: {alert.severity} - Urgency: {alert.urgency ?? '-'} - Certainty: {alert.certainty ?? '-'}
          </p>
        </div>

        {/* SMS Preview EN */}
        <div className={sectionClass}>
          <h2 className={headingClass}>SMS Preview - English</h2>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 font-mono text-sm text-[var(--color-ink)]">
            <p className="font-semibold">{alert.headline_en || alert.event_en || 'No headline set'}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--color-ink)]/80">
              {alert.instructions_en || 'No instructions set'}
            </p>
          </div>
        </div>

        {/* SMS Preview UR (with fallback) */}
        <div className={sectionClass}>
          <h2 className={headingClass}>SMS Preview - Urdu</h2>
          {alert.headline_ur || alert.instructions_ur ? (
            <div dir="rtl" className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 text-sm text-[var(--color-ink)]">
              <p className="font-semibold">{alert.headline_ur || alert.event_ur}</p>
              <p className="mt-1 whitespace-pre-wrap text-[var(--color-ink)]/80">
                {alert.instructions_ur}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--color-emergency)]/50 bg-[var(--color-emergency)]/5 p-3 text-sm text-[var(--color-emergency)]">
              ⚠ No Urdu translation provided for this alert. Go back to the CAP Composer to add one before a real dispatch.
            </div>
          )}
        </div>

        {/* Channel breakdown */}
        <div className={sectionClass}>
          <h2 className={headingClass}>Channel Breakdown</h2>
          {recipientCounts && recipientCounts.length > 0 ? (
            <div className="space-y-2">
              {recipientCounts.map((c) => {
                const delivery = deliveries?.find((d) => d.channel === c.channel)
                return (
                  <div key={c.channel} className="flex items-center justify-between text-sm">
                    <span>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                    <span className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink)]/60">
                      {c.recipient_count.toLocaleString()} recipients
                      {delivery && (
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 uppercase text-[var(--color-primary)]">
                          {delivery.status}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
              <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink)]/50">
                Total estimated reach: {totalRecipients.toLocaleString()} (demo data)
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">
              No recipient data seeded for this district yet.
            </p>
          )}
        </div>

        {/* Dispatch action */}
        <div className={sectionClass}>
          <h2 className={headingClass}>Dispatch</h2>
          {alreadyDispatched ? (
            <p className="text-sm text-[var(--color-ink)]/60">
              This alert has already been dispatched (dry run). See channel statuses above.
            </p>
          ) : (
            <form
              action={async () => {
                'use server'
                await sendDryRunDissemination(id, districtId)
              }}
            >
              <button
                type="submit"
                disabled={!recipientCounts || recipientCounts.length === 0}
                className="rounded-md bg-[var(--color-emergency)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dispatch (Dry Run)
              </button>
              <p className="mt-2 text-xs text-[var(--color-ink)]/50">
                Dry run - no real SMS, WhatsApp, or email will be sent. Simulates queued delivery for demo purposes.
              </p>
            </form>
          )}
        </div>
	{/* Acknowledgement Simulation - only meaningful once something has been dispatched */}
        {alreadyDispatched && deliveries && (
          <AckSimulator alertId={id} initialDeliveries={deliveries} />
        )}
      </div>
    </div>
  )
}