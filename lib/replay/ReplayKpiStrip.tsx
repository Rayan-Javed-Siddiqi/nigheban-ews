'use client'

import { useReplay } from './ReplayContext'
import { getReplayKpis } from './adapters'

interface LiveKpis {
  activeWarnings: number
  districtsAffected: number | string
  districtCount: number
  popAffected: number | string
  deliveryRate: string
  deliveryDetail: string
}

export default function ReplayKpiStrip({ live }: { live: LiveKpis }) {
  const { isReplaying, currentFrame } = useReplay()
  const replay = getReplayKpis(currentFrame)

  const kpis = isReplaying && replay
    ? replay
    : {
        activeWarnings: live.activeWarnings,
        districtsAffected: live.districtsAffected,
        populationAffected:
          typeof live.popAffected === 'number' && live.popAffected > 0
            ? live.popAffected.toLocaleString()
            : '—',
        deliveryRate: live.deliveryRate,
        deliveryDetail: live.deliveryDetail,
      }

  return (
    <div className="grid grid-cols-4 gap-px border-b border-[var(--color-border)] bg-[var(--color-border)]">
      <div className={`px-6 py-4 ${isReplaying ? 'bg-amber-50' : 'bg-[var(--color-surface)]'}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">Active Warnings</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-emergency)]">{kpis.activeWarnings}</p>
      </div>
      <div className={`px-6 py-4 ${isReplaying ? 'bg-amber-50' : 'bg-[var(--color-surface)]'}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">Districts Affected</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">{kpis.districtsAffected}</p>
        {!isReplaying && (
          <p className="mt-0.5 text-xs text-[var(--color-ink)]/40">{live.districtCount} monitored</p>
        )}
      </div>
      <div className={`px-6 py-4 ${isReplaying ? 'bg-amber-50' : 'bg-[var(--color-surface)]'}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">Population Affected</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">{kpis.populationAffected}</p>
      </div>
      <div className={`px-6 py-4 ${isReplaying ? 'bg-amber-50' : 'bg-[var(--color-surface)]'}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">Delivery Success Rate</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">
          {kpis.deliveryRate}
          <span className="ml-2 text-xs text-[var(--color-ink)]/50">{kpis.deliveryDetail}</span>
        </p>
      </div>
    </div>
  )
}
