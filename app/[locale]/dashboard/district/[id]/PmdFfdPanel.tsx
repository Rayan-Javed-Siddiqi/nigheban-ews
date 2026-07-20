import { formatPkt } from '@/lib/hazard-console'
import {
  floodLevelClass,
  normalizeFloodLevel,
  riversForDistrict,
  type PmdFloodLevel,
} from '@/lib/pmd/rivers'
import { legacyJsonToRivers, type PmdRiverReading } from '@/lib/ingest/pmd-fetch'

type PmdDisplay = {
  bulletin_id?: number
  warning_level?: string | null
  forecast_text?: string | null
  rivers?: unknown
  fetched_at?: string
  source_url?: string
  matched_by_date?: boolean
}

export default function PmdFfdPanel({
  districtName,
  pmd,
  liveFetch,
}: {
  districtName: string
  pmd: PmdDisplay | null
  liveFetch?: boolean
}) {
  if (!pmd?.forecast_text) {
    return (
      <p className="text-sm text-[var(--color-ink)]/50">
        No PMD FFD bulletin ingested yet — run{' '}
        <code className="font-mono text-xs">/api/ingest/pmd-snapshot</code>.
      </p>
    )
  }

  const rivers: PmdRiverReading[] = legacyJsonToRivers(pmd.rivers)
  const mapped = rivers.map((r) => ({
    name: r.location ? `${r.name} at ${r.location}` : r.name,
    location: r.location,
    flow: r.flow_cusecs != null ? String(r.flow_cusecs) : null,
    level: r.flood_level,
  }))
  const filtered = riversForDistrict(districtName, mapped)
  const districtRivers = filtered.map((legacy) => {
    const baseName = legacy.name.split(' at ')[0] ?? legacy.name
    const match = rivers.find(
      (r) => r.name === baseName && (r.location ?? null) === (legacy.location ?? null)
    )
    return (
      match ?? {
        name: baseName,
        location: legacy.location ?? null,
        flow_cusecs: legacy.flow ? parseInt(legacy.flow, 10) : null,
        flood_level: legacy.level,
      }
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {pmd.warning_level && (
          <span className="rounded-full bg-[var(--color-emergency)]/10 px-3 py-1 text-xs font-semibold uppercase text-[var(--color-emergency)]">
            {pmd.warning_level}
          </span>
        )}
        <span className="text-xs text-[var(--color-ink)]/50">
          Official PMD FFD · Bulletin #{pmd.bulletin_id ?? '—'} · {formatPkt(pmd.fetched_at!)} PKT
          {liveFetch && ' · live fetch'}
          {pmd.matched_by_date === false && ' · latest available (not today\'s date row)'}
        </span>
      </div>

      {/* MVP: bulletin text verbatim */}
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink)]/40">
          Bulletin text (verbatim)
        </p>
        <div className="max-h-64 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-base)] p-3">
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--color-ink)]">
            {pmd.forecast_text}
          </pre>
        </div>
      </div>

      {/* MVP: river discharge table */}
      {districtRivers.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink)]/40">
            River flows — {districtName} relevance
          </p>
          <div className="overflow-x-auto rounded border border-[var(--color-border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--color-surface)] text-[var(--color-ink)]/50">
                <tr>
                  <th className="px-3 py-2 font-semibold">River / gauge</th>
                  <th className="px-3 py-2 font-semibold">Discharge</th>
                  <th className="px-3 py-2 font-semibold">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {districtRivers.map((r, i) => {
                  const level = normalizeFloodLevel(r.flood_level) as PmdFloodLevel
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        {r.name}
                        {r.location && (
                          <span className="text-[var(--color-ink)]/50"> at {r.location}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {r.flow_cusecs != null ? `${r.flow_cusecs.toLocaleString()} cusecs` : '—'}
                      </td>
                      <td className={`px-3 py-2 capitalize ${floodLevelClass(level)}`}>
                        {r.flood_level ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pmd.source_url && (
        <a
          href={pmd.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-primary)] underline"
        >
          Source PDF on ffd.pmd.gov.pk
        </a>
      )}
    </div>
  )
}
