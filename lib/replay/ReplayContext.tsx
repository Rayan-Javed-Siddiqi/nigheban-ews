'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import type { ReplayFrame, ReplayScenario } from './types'
import { parseFrameData } from './adapters'

export type { ReplayFrame, ReplayScenario } from './types'

interface ReplayContextValue {
  isReplaying: boolean
  scenario: ReplayScenario | null
  scenarios: ReplayScenario[]
  scenariosLoadError: string | null
  frames: ReplayFrame[]
  currentFrame: ReplayFrame | null
  playbackSeconds: number
  isPlaying: boolean
  speedMultiplier: number
  loadScenario: (slug: string) => Promise<void>
  play: () => void
  pause: () => void
  seekToScenarioSeconds: (t: number) => void
  setSpeedMultiplier: (n: number) => void
  exitReplay: () => void
}

const ReplayContext = createContext<ReplayContextValue | null>(null)

function supabaseBrowser() {
  return createBrowserSupabase()
}

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [scenarios, setScenarios] = useState<ReplayScenario[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scenario, setScenario] = useState<ReplayScenario | null>(null)
  const [frames, setFrames] = useState<ReplayFrame[]>([])
  const [playbackSeconds, setPlaybackSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speedMultiplier, setSpeedMultiplierState] = useState(120)

  const tickRef = useRef<number | null>(null)
  const lastTickTimeRef = useRef<number>(0)

  useEffect(() => {
    const supabase = supabaseBrowser()
    supabase
      .from('replay_scenarios')
      .select('id, slug, name, description, hazard_type, district, duration_seconds, default_speed_multiplier')
      .eq('is_published', true)
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load replay scenarios:', error.message)
          setLoadError(error.message)
          return
        }
        setLoadError(null)
        setScenarios(data ?? [])
      })
  }, [])

  const loadScenario = useCallback(async (slug: string) => {
    const supabase = supabaseBrowser()

    const { data: scenarioRow, error: scenarioError } = await supabase
      .from('replay_scenarios')
      .select('*')
      .eq('slug', slug)
      .single()
    if (scenarioError || !scenarioRow) {
      console.error('Failed to load scenario:', scenarioError?.message)
      return
    }

    const { data: frameRows, error: framesError } = await supabase
      .from('replay_frames')
      .select('*')
      .eq('scenario_id', scenarioRow.id)
      .order('t_offset_seconds', { ascending: true })
    if (framesError) {
      console.error('Failed to load replay frames:', framesError.message)
      return
    }

    const parsedFrames: ReplayFrame[] = (frameRows ?? []).map((row) => ({
      ...row,
      frame_data: parseFrameData(row.frame_data),
    }))

    setScenario(scenarioRow)
    setFrames(parsedFrames)
    setPlaybackSeconds(0)
    setSpeedMultiplierState(scenarioRow.default_speed_multiplier)
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    if (!isPlaying || !scenario) return

    lastTickTimeRef.current = performance.now()

    const tick = (now: number) => {
      const deltaRealMs = now - lastTickTimeRef.current
      lastTickTimeRef.current = now
      const deltaScenarioSeconds = (deltaRealMs / 1000) * speedMultiplier

      setPlaybackSeconds((prev) => {
        const next = prev + deltaScenarioSeconds
        if (next >= scenario.duration_seconds) {
          setIsPlaying(false)
          return scenario.duration_seconds
        }
        return next
      })

      tickRef.current = requestAnimationFrame(tick)
    }

    tickRef.current = requestAnimationFrame(tick)
    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current)
    }
  }, [isPlaying, scenario, speedMultiplier])

  const currentFrame = useMemo(() => {
    if (frames.length === 0) return null
    let match = frames[0]
    for (const f of frames) {
      if (f.t_offset_seconds <= playbackSeconds) {
        match = f
      } else {
        break
      }
    }
    return match
  }, [frames, playbackSeconds])

  const play = useCallback(() => setIsPlaying(true), [])
  const pause = useCallback(() => setIsPlaying(false), [])
  const seekToScenarioSeconds = useCallback((t: number) => {
    setPlaybackSeconds(Math.max(0, t))
  }, [])
  const setSpeedMultiplier = useCallback((n: number) => setSpeedMultiplierState(n), [])
  const exitReplay = useCallback(() => {
    setIsPlaying(false)
    setScenario(null)
    setFrames([])
    setPlaybackSeconds(0)
  }, [])

  const value: ReplayContextValue = {
    isReplaying: scenario !== null,
    scenario,
    scenarios,
    scenariosLoadError: loadError,
    frames,
    currentFrame,
    playbackSeconds,
    isPlaying,
    speedMultiplier,
    loadScenario,
    play,
    pause,
    seekToScenarioSeconds,
    setSpeedMultiplier,
    exitReplay,
  }

  return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
}

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext)
  if (!ctx) throw new Error('useReplay must be used within a ReplayProvider')
  return ctx
}
