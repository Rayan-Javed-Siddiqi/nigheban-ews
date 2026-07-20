'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useReplay } from '@/lib/replay/ReplayContext'
import { formatReplayDuration } from '@/lib/replay/adapters'
import { phaseLabel, phaseColor } from '@/lib/replay/labels'
import { isFloodFrame, isGlofFrame } from '@/lib/replay/types'

export default function ReplayPage() {
  const locale = useLocale()
  const router = useRouter()
  const {
    isReplaying,
    scenario,
    scenarios,
    currentFrame,
    playbackSeconds,
    isPlaying,
    speedMultiplier,
    scenariosLoadError,
    loadScenario,
    play,
    pause,
    seekToScenarioSeconds,
    setSpeedMultiplier,
    exitReplay,
  } = useReplay()

  const launchOnOverview = async (slug: string) => {
    await loadScenario(slug)
    router.push(`/${locale}/dashboard`)
    setTimeout(() => play(), 300)
  }

  if (!isReplaying || !scenario) {
    return (
      <div className="min-h-screen bg-[var(--color-base)]">
        <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
          <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
            ← Provincial Overview
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-white">Replay Mode</h1>
          <p className="text-sm text-white/70">
            Time-compressed historical scenarios at 60–300× speed for demos and training.
          </p>
        </header>

        <div className="mx-auto max-w-2xl space-y-4 p-6">
          {scenarios.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-ink)]/50">
              {scenariosLoadError ? (
                <>Could not load scenarios: {scenariosLoadError}</>
              ) : (
                <>
                  No published scenarios found. Run{' '}
                  <code className="font-mono text-xs">python scripts/seed_replay_hunza_shisper.py</code> and{' '}
                  <code className="font-mono text-xs">python scripts/seed_replay_nowshera_flood.py</code>.
                </>
              )}
            </p>
          )}

          {scenarios.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[var(--color-ink)]">{s.name}</h2>
                  <p className="mt-1 text-sm text-[var(--color-ink)]/70">{s.description}</p>
                  <p className="mt-2 font-mono text-xs text-[var(--color-ink)]/40">
                    {s.district} · {s.hazard_type} · {formatReplayDuration(s.duration_seconds)} real time ·{' '}
                    {s.default_speed_multiplier}× default
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => loadScenario(s.slug)}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-white"
                >
                  Open here
                </button>
                <button
                  type="button"
                  onClick={() => launchOnOverview(s.slug)}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                >
                  Launch on Overview →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const progressPct = (playbackSeconds / scenario.duration_seconds) * 100
  const phase = currentFrame?.phase ?? 'baseline'
  const data = currentFrame?.frame_data

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
          ← Overview
        </Link>
        <h1 className="text-lg font-semibold text-white">{scenario.name}</h1>
        <button
          type="button"
          onClick={exitReplay}
          className="ml-auto rounded border border-white/30 px-3 py-1 text-sm text-white hover:bg-white/10"
        >
          Exit Replay
        </button>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div
          className="rounded-lg border bg-[var(--color-surface)] p-5"
          style={{ borderColor: `${phaseColor(phase)}44` }}
        >
          <span
            className="inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase text-white"
            style={{ backgroundColor: phaseColor(phase) }}
          >
            {phaseLabel(phase)}
          </span>
          <p className="mt-3 text-sm text-[var(--color-ink)]">{currentFrame?.narration}</p>
        </div>

        <div>
          <input
            type="range"
            min={0}
            max={scenario.duration_seconds}
            step={1}
            value={playbackSeconds}
            onChange={(e) => seekToScenarioSeconds(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="mt-1 flex justify-between text-xs text-[var(--color-ink)]/50">
            <span>{formatReplayDuration(playbackSeconds)}</span>
            <span>{formatReplayDuration(scenario.duration_seconds)} total</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={isPlaying ? pause : play}
            className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value={60}>60×</option>
            <option value={120}>120×</option>
            <option value={200}>200×</option>
            <option value={300}>300×</option>
          </select>
          <span className="text-sm text-[var(--color-ink)]/50">{Math.round(progressPct)}% complete</span>
          <button
            type="button"
            onClick={() => router.push(`/${locale}/dashboard`)}
            className="ml-auto text-sm text-[var(--color-primary)] underline"
          >
            View on map →
          </button>
        </div>

        {data && (
          <div className="grid gap-4 md:grid-cols-2">
            {isGlofFrame(data) && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
                <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">GLOF Station</h2>
                <dl className="space-y-1 text-sm">
                  <div>Water level: <strong>{data.station.water_level_m} m</strong></div>
                  <div>Rate of rise: <strong>{data.station.rate_of_rise_m_per_hr} m/hr</strong></div>
                  <div>Battery: {data.station.battery_voltage} V · RSSI {data.station.rssi_dbm} dBm</div>
                </dl>
              </div>
            )}
            {isFloodFrame(data) && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
                <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">River Gauge</h2>
                <dl className="space-y-1 text-sm">
                  <div>{data.gauge.name}</div>
                  <div>Discharge: <strong>{data.gauge.discharge_cusecs.toLocaleString()} cusecs</strong></div>
                  <div>Level: <strong>{data.gauge.level_m} m</strong></div>
                  <div>FFD risk: {data.gauge.ffd_risk_level}</div>
                </dl>
              </div>
            )}
            <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">Alert</h2>
              {data.alert ? (
                <dl className="space-y-1 text-sm">
                  <div>{data.alert.event}</div>
                  <div>Severity: <strong>{data.alert.severity}</strong></div>
                  <div>Status: {data.alert.status}</div>
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-ink)]/40">No alert yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 md:col-span-2">
              <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">Dissemination</h2>
              <div className="flex flex-wrap gap-6 text-sm font-mono">
                <span>Sent: {data.dissemination.sent}</span>
                <span>Delivered: {data.dissemination.delivered}</span>
                <span>Failed: {data.dissemination.failed}</span>
                <span>Ack: {data.dissemination.acknowledged}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
