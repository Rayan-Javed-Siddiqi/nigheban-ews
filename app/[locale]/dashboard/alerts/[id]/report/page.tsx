import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { loadPostEventReport, reportHeadline } from '@/lib/post-event-report'
import { actionLabel, formatAuditTimestamp, formatDetail } from '@/lib/audit'
import { CHANNEL_LABELS } from '@/lib/dissemination'

export default async function PostEventReportPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const data = await loadPostEventReport(supabase, id)
  if (!data) notFound()

  const a = data.alert
  const status = a.status as string

  return (
    <div className="min-h-screen bg-white text-gray-900 print:min-h-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mx-auto max-w-[210mm] p-8 print:p-0">
        {/* Header */}
        <header className="mb-6 border-b-2 border-[#1e3a5f] pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1e3a5f]">
            Nigheban Early Warning System
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Post-Event Report</h1>
          <p className="mt-1 text-sm text-gray-600">Generated {data.generatedAt}</p>
        </header>

        {/* Alert summary */}
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Alert Summary</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600 w-36">Headline</td>
                <td className="py-1.5">{reportHeadline(data)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Status</td>
                <td className="py-1.5 uppercase font-mono text-sm">{status}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Severity</td>
                <td className="py-1.5 uppercase">{a.severity as string}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">District</td>
                <td className="py-1.5">
                  {data.districtName ? `${data.districtName}, ${data.province}` : '—'}
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Alert ID</td>
                <td className="py-1.5 font-mono text-xs">{id}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Detection */}
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">What Was Detected</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600 w-36">Metric</td>
                <td className="py-1.5">{a.metric_name as string}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Observed</td>
                <td className="py-1.5 font-mono">{String(a.observed_value)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Threshold</td>
                <td className="py-1.5 font-mono">{String(a.threshold_value)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Detected at</td>
                <td className="py-1.5">{formatAuditTimestamp(a.created_at as string)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-sm text-gray-700">{a.description as string}</p>
        </section>

        {/* Approval */}
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Approval &amp; Issue</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600 w-36">Issued by</td>
                <td className="py-1.5">{data.issuerName ?? '—'}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 font-semibold text-gray-600">Issued at</td>
                <td className="py-1.5">
                  {a.issued_at ? formatAuditTimestamp(a.issued_at as string) : 'Not yet issued'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Dissemination */}
        {data.deliveryStats && (
          <section className="mb-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Dissemination &amp; Acknowledgement
            </h2>
            <div className="mb-3 grid grid-cols-4 gap-2 text-center text-sm">
              {[
                ['Reach (est.)', data.deliveryStats.estimatedReach.toLocaleString()],
                ['Delivered', data.deliveryStats.delivered + data.deliveryStats.acknowledged],
                ['Acknowledged', data.deliveryStats.acknowledged],
                ['Ack rate', `${data.deliveryStats.ackRate}%`],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded border border-gray-200 p-2">
                  <div className="text-lg font-bold">{val}</div>
                  <div className="text-xs uppercase text-gray-500">{label as string}</div>
                </div>
              ))}
            </div>
            {data.channels.length > 0 && (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-gray-500">
                    <th className="py-1">Channel</th>
                    <th className="py-1 text-right">Recipients (demo)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.channels.map((c) => (
                    <tr key={c.channel} className="border-b border-gray-100">
                      <td className="py-1">{CHANNEL_LABELS[c.channel] ?? c.channel}</td>
                      <td className="py-1 text-right font-mono">{c.recipient_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* Timeline (condensed) */}
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Event Timeline</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-500">
                <th className="py-1 pr-2">Time (PKT)</th>
                <th className="py-1 pr-2">Event</th>
                <th className="py-1">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-1 pr-2 whitespace-nowrap font-mono">{formatAuditTimestamp(log.at)}</td>
                  <td className="py-1 pr-2">{actionLabel(log.action)}</td>
                  <td className="py-1 text-gray-600">{formatDetail(log.detail) || log.actor_role || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* CAP excerpt */}
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Public Instructions (EN)</h2>
          <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm whitespace-pre-wrap">
            {(a.instructions_en as string) || '—'}
          </p>
        </section>

        <footer className="mt-8 border-t border-gray-200 pt-3 text-center text-xs text-gray-400">
          Finova Solutions · Nigheban EWS · Append-only audit trail · CAP 1.2
        </footer>
      </div>
    </div>
  )
}
