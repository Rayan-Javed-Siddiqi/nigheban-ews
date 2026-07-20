'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useReplay } from './ReplayContext'
import { phaseLabel } from './labels'

export default function ReplayBanner() {
  const locale = useLocale()
  const { isReplaying, scenario, currentFrame, exitReplay } = useReplay()

  if (!isReplaying || !scenario) return null

  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-400/40 bg-amber-500 px-4 py-2 text-amber-950">
      <div className="flex items-center gap-3 text-sm">
        <span className="rounded bg-amber-950 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-100">
          Replay
        </span>
        <span className="font-semibold">{scenario.name}</span>
        {currentFrame && (
          <span className="rounded-full bg-amber-950/10 px-2 py-0.5 text-xs font-medium">
            {phaseLabel(currentFrame.phase)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/dashboard/replay`}
          className="text-xs font-medium underline hover:no-underline"
        >
          Full controls
        </Link>
        <button
          type="button"
          onClick={exitReplay}
          className="rounded border border-amber-950/30 bg-white/80 px-3 py-1 text-xs font-semibold hover:bg-white"
        >
          Exit replay
        </button>
      </div>
    </div>
  )
}
