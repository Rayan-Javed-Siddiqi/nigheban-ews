import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { submitManualReading } from '../../district-actions'

export default async function DistrictConsolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: district } = await supabase
    .from('district')
    .select('id, name_en, province, adm2_code, population')
    .eq('id', id)
    .single()

  if (!district) notFound()

  const { data: manualReadings } = await supabase
    .from('manual_reading')
    .select('id, source, station_name, reading_type, value, unit, entered_at, notes')
    .eq('district_id', id)
    .order('entered_at', { ascending: false })
    .limit(10)

  const { data: ingestStatus } = await supabase
    .from('ingest_status')
    .select('source, status, last_success_at')
    .order('source')

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← Provincial Overview
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">{district.name_en}</h1>
        <p className="text-sm text-white/70">
          {district.province} · {district.adm2_code}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        {/* Source freshness footer */}
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Data Source Health
          </h2>
          <div className="space-y-2">
            {ingestStatus?.map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="font-mono">{s.source}</span>
                <span className="flex items-center gap-2 text-[var(--color-ink)]/60">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.status === 'ok' ? 'bg-[var(--color-primary-hover)]' : 'bg-[var(--color-emergency)]'
                    }`}
                  />
                  {s.last_success_at
                    ? new Date(s.last_success_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })
                    : 'never'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* PMD manual entry fallback */}
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            PMD Manual Entry
          </h2>
          <p className="mb-3 text-xs text-[var(--color-ink)]/50">
            Automated PMD scraping is pending — enter bulletin readings manually until resolved.
          </p>
          <form action={submitManualReading} className="space-y-2">
            <input type="hidden" name="district_id" value={district.id} />
            <input
              name="station_name"
              placeholder="Station / river name"
              required
              className="w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <input
                name="reading_type"
                placeholder="Type (e.g. discharge)"
                required
                className="w-1/2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
              />
              <input
                name="value"
                type="number"
                step="any"
                placeholder="Value"
                required
                className="w-1/4 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
              />
              <input
                name="unit"
                placeholder="Unit"
                className="w-1/4 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
              />
            </div>
            <input
              name="notes"
              placeholder="Notes (optional)"
              className="w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:bg-[var(--color-primary-hover)]"
            >
              Submit Reading
            </button>
          </form>

          {manualReadings && manualReadings.length > 0 && (
            <div className="mt-4 space-y-1 border-t border-[var(--color-border)] pt-3">
              {manualReadings.map((r) => (
                <div key={r.id} className="font-mono text-xs text-[var(--color-ink)]/70">
                  {r.station_name} — {r.reading_type}: {r.value} {r.unit}
                  <span className="ml-2 text-[var(--color-ink)]/40">
                    ({new Date(r.entered_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })})
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}