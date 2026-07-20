'use client'

import { useState } from 'react'
import { useReplay } from '@/lib/replay/ReplayContext'
import ReplayHazardPanel from '@/lib/replay/ReplayHazardPanel'
interface HazardConsoleSidebarProps {
  hazardsPanel: React.ReactNode
  advisoriesPanel: React.ReactNode
}

export default function HazardConsoleSidebar({
  hazardsPanel,
  advisoriesPanel,
}: HazardConsoleSidebarProps) {
  const [tab, setTab] = useState<'hazards' | 'advisories'>('hazards')
  const { isReplaying } = useReplay()

  return (
    <div className="flex h-full w-80 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex border-b border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setTab('hazards')}
          className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
            tab === 'hazards'
              ? 'border-b-2 border-[var(--color-emergency)] text-[var(--color-ink)]'
              : 'text-[var(--color-ink)]/50 hover:text-[var(--color-ink)]/70'
          }`}
        >
          Active Hazards
        </button>
        <button
          type="button"
          onClick={() => setTab('advisories')}
          className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
            tab === 'advisories'
              ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-ink)]'
              : 'text-[var(--color-ink)]/50 hover:text-[var(--color-ink)]/70'
          }`}
        >
          Advisories
        </button>
      </div>

      {tab === 'hazards' ? (isReplaying ? <ReplayHazardPanel /> : hazardsPanel) : advisoriesPanel}    </div>
  )
}
