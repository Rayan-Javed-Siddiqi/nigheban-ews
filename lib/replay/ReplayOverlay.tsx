'use client'

import { useReplay } from './ReplayContext'
import { formatReplayDuration } from './adapters'
import { phaseLabel, phaseColor } from './labels'

/** Compact playback scrubber — floats over dashboard map during replay. */
export default function ReplayOverlay() {
  const {
    isReplaying,
    scenario,
    currentFrame,
    playbackSeconds,
    isPlaying,
    speedMultiplier,
    play,
    pause,
    seekToScenarioSeconds,
    setSpeedMultiplier,
  } = useReplay()

  if (!isReplaying || !scenario) return null

  const progressPct = (playbackSeconds / scenario.duration_seconds) * 100
  const phase = currentFrame?.phase ?? 'baseline'

  return (
    <div className="pointer-events-auto absolute bottom-6 left-6 right-6 z-20 mx-auto max-w-3xl rounded-xl border border-white/20 bg-[var(--color-primary)]/95 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
          style={{ backgroundColor: phaseColor(phase) }}
        >
          {phaseLabel(phase)}
        </span>
        <p className="flex-1 truncate text-sm text-white/90">{currentFrame?.narration}</p>
      </div>

      <input
        type="range"
        min={0}
        max={scenario.duration_seconds}
        step={1}
        value={playbackSeconds}
        onChange={(e) => seekToScenarioSeconds(Number(e.target.value))}
        className="mb-2 w-full accent-[var(--color-emergency)]"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={isPlaying ? pause : play}
            className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-white/90"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
            className="rounded border border-white/30 bg-white/10 px-2 py-1 text-white"
          >
            <option value={60}>60×</option>
            <option value={120}>120×</option>
            <option value={200}>200×</option>
            <option value={300}>300×</option>
          </select>
        </div>
        <span>
          {formatReplayDuration(playbackSeconds)} / {formatReplayDuration(scenario.duration_seconds)}
        </span>
        <span>{Math.round(progressPct)}%</span>
      </div>
    </div>
  )
}
