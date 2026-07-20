'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  batteryPercent,
  formatPkt,
  statusBadgeClass,
  type StationHealthRow,
} from '@/lib/station-health'
import StationSparkline from './StationSparkline'

interface MaintenanceTicket {
  id: string
  station_id: string | null
  reason: string
  status: string
  created_at: string | null
  station_name?: string
}

interface StationHealthClientProps {
  stations: StationHealthRow[]
  tickets: MaintenanceTicket[]
}

type StatusFilter = 'all' | 'online' | 'degraded' | 'offline'

export default function StationHealthClient({ stations, tickets }: StationHealthClientProps) {
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({})
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<'grid' | 'table'>('grid')

  useEffect(() => {
    fetch('/api/stations/sparklines')
      .then((r) => r.json())
      .then(setSparklines)
      .catch(() => setSparklines({}))
  }, [])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return stations
    return stations.filter((s) => s.status === statusFilter)
  }, [stations, statusFilter])

  const openTickets = tickets.filter((t) => t.status === 'open')

  return (
    <div className="space-y-6">
      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['all', 'online', 'degraded', 'offline'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-mono uppercase transition-colors ${
                statusFilter === f
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]/60 hover:border-[var(--color-primary-hover)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`rounded px-3 py-1 text-xs ${view === 'grid' ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-border)]'}`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={`rounded px-3 py-1 text-xs ${view === 'table' ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-border)]'}`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Open maintenance tickets */}
      {openTickets.length > 0 && (
        <section className="rounded-lg border border-[var(--color-emergency)]/30 bg-[var(--color-emergency)]/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-emergency)]">
            Open Maintenance Tickets ({openTickets.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {openTickets.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[var(--color-ink)]/80">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-emergency)]" />
                <span>
                  <strong>{t.station_name ?? 'Unknown station'}</strong>
                  {' — '}
                  {t.reason}
                  {t.created_at && (
                    <span className="ml-2 font-mono text-xs text-[var(--color-ink)]/40">
                      {formatPkt(t.created_at)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <article
              key={s.station_id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{s.name}</h3>
                  <p className="truncate text-xs text-[var(--color-ink)]/50">
                    {s.valley ?? '—'} · {s.district_name ?? '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-mono uppercase ${statusBadgeClass(s.status)}`}
                >
                  {s.status}
                </span>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--color-ink)]/50">Battery</p>
                  <div className="mt-1 h-2 w-20 rounded-full bg-[var(--color-border)]">
                    <div
                      className={`h-2 rounded-full ${
                        (s.battery_voltage ?? 12) < 11
                          ? 'bg-[#E0A030]'
                          : 'bg-[var(--color-primary-hover)]'
                      }`}
                      style={{ width: `${batteryPercent(s.battery_voltage)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-ink)]/60">
                    {s.battery_voltage != null ? `${s.battery_voltage}V` : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--color-ink)]/50">24h activity</p>
                  <StationSparkline data={sparklines[s.station_id] ?? []} />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-ink)]/50">
                <span className="font-mono uppercase">{s.kind.replace('_', ' ')}</span>
                <span className="font-mono">{formatPkt(s.last_transmission_at)} PKT</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-base)] text-left text-xs uppercase text-[var(--color-ink)]/50">
              <tr>
                <th className="px-4 py-2">Station</th>
                <th className="px-4 py-2">Valley</th>
                <th className="px-4 py-2">District</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Battery</th>
                <th className="px-4 py-2">24h</th>
                <th className="px-4 py-2">Last TX (PKT)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.station_id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]/60">{s.valley ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]/60">{s.district_name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-mono uppercase ${statusBadgeClass(s.status)}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-24 rounded-full bg-[var(--color-border)]">
                      <div
                        className="h-2 rounded-full bg-[var(--color-primary-hover)]"
                        style={{ width: `${batteryPercent(s.battery_voltage)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StationSparkline data={sparklines[s.station_id] ?? []} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-[var(--color-ink)]/60">
                    {formatPkt(s.last_transmission_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--color-ink)]/50">
          No stations match the selected filter.
        </p>
      )}
    </div>
  )
}
