'use client'

import { useReplay } from './ReplayContext'
import { getReplayHazardCard } from './adapters'
import { phaseLabel } from './labels'

function severityClass(severity: string): string {
  if (severity.includes('emergency') || severity.includes('extreme')) {
    return 'bg-[var(--color-emergency)]/15 text-[var(--color-emergency)]'
  }
  if (severity.includes('warning') || severity.includes('severe') || severity.includes('high')) {
    return 'bg-amber-500/15 text-amber-700'
  }
  return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
}

/** Sidebar hazard readout driven by replay frames (replaces live feed during replay). */
export default function ReplayHazardPanel() {
  const { scenario, currentFrame } = useReplay()
  const card = getReplayHazardCard(currentFrame, scenario)

  if (!card) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-[var(--color-ink)]/50">Scrub the timeline to view hazard progression.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
        Replay scenario — {scenario?.district}
      </div>
      <div className="rounded-lg border border-[var(--color-border)] p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase text-[var(--color-ink)]/50">
            {card.hazard} · {card.source}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${severityClass(card.severity)}`}>
            {card.severity}
          </span>
        </div>
        <h3 className="text-sm font-medium leading-tight text-[var(--color-ink)]">{card.title}</h3>
        <p className="mt-1 text-xs text-[var(--color-ink)]/60">{card.subtitle}</p>
        {currentFrame && (
          <p className="mt-2 font-mono text-[10px] text-[var(--color-ink)]/40">
            Phase: {phaseLabel(currentFrame.phase)}
          </p>
        )}
      </div>

      {currentFrame?.frame_data.dissemination && currentFrame.frame_data.dissemination.sent > 0 && (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-xs">
          <p className="mb-2 font-semibold uppercase tracking-wide text-[var(--color-ink)]/50">Dissemination</p>
          <div className="grid grid-cols-2 gap-2 font-mono">
            <div>Sent: {currentFrame.frame_data.dissemination.sent}</div>
            <div>Delivered: {currentFrame.frame_data.dissemination.delivered}</div>
            <div>Failed: {currentFrame.frame_data.dissemination.failed}</div>
            <div>Ack: {currentFrame.frame_data.dissemination.acknowledged}</div>
          </div>
        </div>
      )}
    </div>
  )
}
