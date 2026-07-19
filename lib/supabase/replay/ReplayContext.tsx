// lib/replay/ReplayContext.tsx
//
// Step 4.4 — Replay Mode: live/replay data-source abstraction.
//
// Wrap your dashboard layout with <ReplayProvider>. Components that
// currently read live data (map markers, station health, alert panel,
// dissemination board) should check `useReplay().isReplaying` and, when
// true, read `currentFrame.frame_data` instead of their live query/hook.
//
// This intentionally does NOT touch your live data hooks — it's an
// additive layer. Existing components keep working unmodified when replay
// is inactive; wiring each one to consume replay frames when active is a
// per-component follow-up (start with DashboardMap and the Alert panel,
// since those are what the demo narrative actually shows).

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@supabase/supabase-js";

export interface ReplayFrame {
  id: string;
  scenario_id: string;
  t_offset_seconds: number;
  phase: string;
  narration: string | null;
  frame_data: {
    station: {
      name: string;
      district: string;
      water_level_m: number;
      rate_of_rise_m_per_hr: number;
      battery_voltage: number;
      rssi_dbm: number;
      status: string;
    };
    alert: {
      event: string;
      severity: string;
      urgency: string;
      certainty: string;
      area: string;
      status: string;
    } | null;
    dissemination: {
      sent: number;
      delivered: number;
      failed: number;
      acknowledged: number;
    };
  };
}

export interface ReplayScenario {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  hazard_type: string;
  district: string | null;
  duration_seconds: number;
  default_speed_multiplier: number;
}

interface ReplayContextValue {
  isReplaying: boolean;
  scenario: ReplayScenario | null;
  scenarios: ReplayScenario[];
  frames: ReplayFrame[];
  currentFrame: ReplayFrame | null;
  playbackSeconds: number; // elapsed *playback* time, not scenario time
  isPlaying: boolean;
  speedMultiplier: number;
  loadScenario: (slug: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  seekToScenarioSeconds: (t: number) => void;
  setSpeedMultiplier: (n: number) => void;
  exitReplay: () => void;
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

function supabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [scenarios, setScenarios] = useState<ReplayScenario[]>([]);
  const [scenario, setScenario] = useState<ReplayScenario | null>(null);
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplierState] = useState(120);

  const tickRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Load the list of published scenarios once, for a scenario picker UI.
  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase
      .from("replay_scenarios")
      .select("id, slug, name, description, hazard_type, district, duration_seconds, default_speed_multiplier")
      .eq("is_published", true)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load replay scenarios:", error.message);
          return;
        }
        setScenarios(data ?? []);
      });
  }, []);

  const loadScenario = useCallback(async (slug: string) => {
    const supabase = supabaseBrowser();

    const { data: scenarioRow, error: scenarioError } = await supabase
      .from("replay_scenarios")
      .select("*")
      .eq("slug", slug)
      .single();
    if (scenarioError || !scenarioRow) {
      console.error("Failed to load scenario:", scenarioError?.message);
      return;
    }

    const { data: frameRows, error: framesError } = await supabase
      .from("replay_frames")
      .select("*")
      .eq("scenario_id", scenarioRow.id)
      .order("t_offset_seconds", { ascending: true });
    if (framesError) {
      console.error("Failed to load replay frames:", framesError.message);
      return;
    }

    setScenario(scenarioRow);
    setFrames(frameRows ?? []);
    setPlaybackSeconds(0);
    setSpeedMultiplierState(scenarioRow.default_speed_multiplier);
    setIsPlaying(false);
  }, []);

  // Playback loop: advance playbackSeconds in real time, mapped through the
  // speed multiplier to scenario time. requestAnimationFrame keeps it smooth
  // without hammering React state updates every ms.
  useEffect(() => {
    if (!isPlaying || !scenario) return;

    lastTickTimeRef.current = performance.now();

    const tick = (now: number) => {
      const deltaRealMs = now - lastTickTimeRef.current;
      lastTickTimeRef.current = now;
      const deltaScenarioSeconds = (deltaRealMs / 1000) * speedMultiplier;

      setPlaybackSeconds((prev) => {
        const next = prev + deltaScenarioSeconds;
        if (next >= scenario.duration_seconds) {
          setIsPlaying(false);
          return scenario.duration_seconds;
        }
        return next;
      });

      tickRef.current = requestAnimationFrame(tick);
    };

    tickRef.current = requestAnimationFrame(tick);
    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
    };
  }, [isPlaying, scenario, speedMultiplier]);

  const currentFrame = useMemo(() => {
    if (frames.length === 0) return null;
    // Find the latest frame whose t_offset_seconds <= current playback position.
    let match = frames[0];
    for (const f of frames) {
      if (f.t_offset_seconds <= playbackSeconds) {
        match = f;
      } else {
        break;
      }
    }
    return match;
  }, [frames, playbackSeconds]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const seekToScenarioSeconds = useCallback((t: number) => {
    setPlaybackSeconds(Math.max(0, t));
  }, []);
  const setSpeedMultiplier = useCallback((n: number) => setSpeedMultiplierState(n), []);
  const exitReplay = useCallback(() => {
    setIsPlaying(false);
    setScenario(null);
    setFrames([]);
    setPlaybackSeconds(0);
  }, []);

  const value: ReplayContextValue = {
    isReplaying: scenario !== null,
    scenario,
    scenarios,
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
  };

  return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>;
}

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error("useReplay must be used within a ReplayProvider");
  return ctx;
}
