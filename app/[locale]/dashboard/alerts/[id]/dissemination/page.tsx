import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { executeDryRunDispatch, executeLiveDispatch } from '../dissemination-actions'
import AckSimulator from './ack-simulator'
import { buildSmsBody, segmentSms, CHANNEL_LABELS } from '@/lib/dissemination'
import { isTwilioSmsConfigured, isTwilioWhatsAppConfigured } from '@/lib/twilio'

export default async function DisseminationBoardPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id, locale } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(id, name_en, province)')
    .eq('id', id)
    .single()

  if (!alert) notFound()
  if (alert.status !== 'issued') {
    redirect(`/${locale}/dashboard/alerts/${id}`)
  }

  const districtId = alert.district?.id ?? alert.district_id

  const [{ data: recipientCounts }, { data: deliveries }, { data: contacts }] = await Promise.all([
    supabase.from('channel_recipient_count').select('channel, recipient_count').eq('district_id', districtId),
    supabase.from('alert_delivery').select('id, channel, recipient, status, status_at, ack_at').eq('alert_id', id),
    supabase.from('district_contact').select('role_title, phone_placeholder').eq('district_id', districtId),
  ])

  const deliveryList = deliveries ?? []
  const hasDeliveries = deliveryList.length > 0
  const dryRunPlanned = deliveryList.some((d) => d.status === 'dry_run')
  const dispatchActive = deliveryList.some((d) => ['queued', 'sent', 'delivered', 'acknowledged', 'failed'].includes(d.status))
  const totalRecipients = (recipientCounts ?? []).reduce((sum, c) => sum + c.recipient_count, 0)

  const smsEn = segmentSms(buildSmsBody(alert, 'en'))
  const smsUr = alert.headline_ur || alert.instructions_ur ? segmentSms(buildSmsBody(alert, 'ur')) : null

  const twilioSmsConfigured = isTwilioSmsConfigured()
  const twilioWhatsAppConfigured = isTwilioWhatsAppConfigured()
  const whatsAppUsesTemplate = Boolean(process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim())

  const sectionClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
  const headingClass = 'mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60'

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard/alerts/${id}`} className="text-sm text-white/70 hover:text-white">
          ← CAP Composer
        </Link>
        <h1 className="text-lg font-semibold text-white">Dissemination Board</h1>
        <span className="ml-auto rounded-full bg-white/10 px-3 py-1 font-mono text-xs uppercase text-white">
          {alert.status}
        </span>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className={sectionClass}>
          <h2 className={headingClass}>Issuing</h2>
          <p className="text-sm text-[var(--color-ink)]">
            {alert.headline_en || alert.title} —{' '}
            {alert.district ? `${alert.district.name_en}, ${alert.district.province}` : 'Global'}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/50">
            Severity: {alert.severity} · Urgency: {alert.urgency ?? '—'} · Certainty: {alert.certainty ?? '—'}
          </p>
          {hasDeliveries && dryRunPlanned && (
            <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Fan-out plan created on issue ({deliveryList.length} delivery rows). Execute dry run to queue messages.
            </p>
          )}
        </div>

        {/* SMS EN with segmentation */}
        <div className={sectionClass}>
          <h2 className={headingClass}>SMS Preview — English</h2>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 font-mono text-sm text-[var(--color-ink)]">
            <p className="whitespace-pre-wrap">{smsEn.text}</p>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink)]/50">
            {smsEn.charCount} chars · {smsEn.encoding} · {smsEn.segmentCount} segment{smsEn.segmentCount > 1 ? 's' : ''}{' '}
            ({smsEn.segmentCount > 1 ? `${smsEn.multipartLimit} chars/part` : `${smsEn.singleLimit} char limit`})
          </p>
          {smsEn.segmentCount > 1 && (
            <div className="mt-2 space-y-1">
              {smsEn.segments.map((seg, i) => (
                <p key={i} className="rounded bg-[var(--color-base)] px-2 py-1 font-mono text-xs text-[var(--color-ink)]/70">
                  Part {i + 1}/{smsEn.segmentCount}: {seg.length} chars
                </p>
              ))}
            </div>
          )}
        </div>

        {/* SMS UR with segmentation */}
        <div className={sectionClass}>
          <h2 className={headingClass}>SMS Preview — Urdu</h2>
          {smsUr ? (
            <>
              <div dir="rtl" className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 text-sm text-[var(--color-ink)]">
                <p className="whitespace-pre-wrap">{smsUr.text}</p>
              </div>
              <p className="mt-2 text-xs text-[var(--color-ink)]/50">
                {smsUr.charCount} chars · {smsUr.encoding} · {smsUr.segmentCount} segment{smsUr.segmentCount > 1 ? 's' : ''}{' '}
                (Urdu uses 70-char Unicode segments)
              </p>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--color-emergency)]/50 bg-[var(--color-emergency)]/5 p-3 text-sm text-[var(--color-emergency)]">
              No Urdu translation — add Urdu CAP fields before live public dispatch.
            </div>
          )}
        </div>
        {/* WhatsApp preview */}
        <div className={sectionClass}>
          <h2 className={headingClass}>WhatsApp Preview — English</h2>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 text-sm text-[var(--color-ink)]">
            <p className="whitespace-pre-wrap">{smsEn.text}</p>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink)]/50">
            WhatsApp allows longer messages than SMS (up to ~4096 chars). Urdu is supported when using free-form or template variables.
          </p>
          {twilioWhatsAppConfigured && (
            <p className="mt-1 text-xs text-emerald-700">
              Live WhatsApp configured
              {whatsAppUsesTemplate ? ' (approved template)' : ' (sandbox / session message)'}
            </p>
          )}
        </div>

        {contacts && contacts.length > 0 && (
          <div className={sectionClass}>
            <h2 className={headingClass}>District Focal Roster (demo)</h2>
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{c.role_title}</span>
                  <span className="font-mono text-xs text-[var(--color-ink)]/60">{c.phone_placeholder}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channel breakdown */}
        <div className={sectionClass}>
          <h2 className={headingClass}>Channel Breakdown</h2>
          {recipientCounts && recipientCounts.length > 0 ? (
            <div className="space-y-2">
              {recipientCounts.map((c) => {
                const channelDeliveries = deliveryList.filter((d) => d.channel === c.channel)
                const status = channelDeliveries[0]?.status
                return (
                  <div key={c.channel} className="flex items-center justify-between text-sm">
                    <span>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                    <span className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink)]/60">
                      {c.recipient_count.toLocaleString()} recipients
                      {status && (
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 uppercase text-[var(--color-primary)]">
                          {status}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
              <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink)]/50">
                Total estimated reach: {totalRecipients.toLocaleString()} (demo counts)
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No recipient data seeded for this district.</p>
          )}
        </div>

        {/* Dispatch controls */}
        <div className={sectionClass}>
          <h2 className={headingClass}>Dispatch</h2>
          <div className="flex flex-wrap gap-3">
            {(dryRunPlanned || !hasDeliveries) && (
              <form action={executeDryRunDispatch.bind(null, id, districtId, locale)}>
                <button
                  type="submit"
                  disabled={!recipientCounts || recipientCounts.length === 0}
                  className="rounded-md bg-[var(--color-emergency)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {dryRunPlanned ? 'Execute dry run (queue messages)' : 'Dispatch (dry run)'}
                </button>
              </form>
            )}
            {twilioSmsConfigured && (
              <form action={executeLiveDispatch.bind(null, id, districtId, locale, 'sms')}>
                <button
                  type="submit"
                  className="rounded-md border-2 border-[var(--color-emergency)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-emergency)] hover:bg-[var(--color-emergency)]/10"
                >
                  Send live SMS (Twilio)
                </button>
              </form>
            )}
            {twilioWhatsAppConfigured && (
              <form action={executeLiveDispatch.bind(null, id, districtId, locale, 'whatsapp')}>
                <button
                  type="submit"
                  className="rounded-md border-2 border-emerald-600 bg-transparent px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Send live WhatsApp (Twilio)
                </button>
              </form>
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink)]/50">
            Dry run is the default — no real messages unless Twilio is configured and you click a live send button.
          </p>
          {!twilioSmsConfigured && !twilioWhatsAppConfigured && (
            <p className="mt-1 text-xs text-[var(--color-ink)]/40">
              Live mode: set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, then WhatsApp (TWILIO_WHATSAPP_FROM / TO) or SMS (TWILIO_FROM_NUMBER / TO) in .env.local
            </p>
          )}
          {twilioWhatsAppConfigured && !whatsAppUsesTemplate && (
            <p className="mt-1 text-xs text-[var(--color-ink)]/40">
              WhatsApp sandbox: in Twilio Console → Messaging → Try WhatsApp, join the sandbox from your phone, then use your E.164 number as TWILIO_WHATSAPP_TO.
            </p>
          )}
        </div>

        {dispatchActive && deliveryList.length > 0 && (
          <AckSimulator alertId={id} initialDeliveries={deliveryList} />
        )}
      </div>
    </div>
  )
}
