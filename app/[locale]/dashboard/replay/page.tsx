// app/[locale]/dashboard/replay/page.tsx
//
// Step 4.4 — Replay Mode: scenario picker + timeline scrubber + playback.
//
// This page is intentionally self-contained for now — it reads directly
// from useReplay() and renders its own readout of the current frame,
// rather than reusing DashboardMap/AlertsView yet. That wiring (making the
// real map/alert components branch on isReplaying and render replay data
// instead of live data) is the next step once this page's data flow is
// confirmed working end-to-end.

"use client";

import { useEffect } from "react";
import { useReplay } from "@/lib/replay/ReplayContext";

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

const PHASE_LABELS: Record<string, string> = {
  baseline: "Baseline",
  rising: "Lake Rising",
  rate_rule_fired: "Rate Rule Fired",
  candidate: "Alert Candidate",
  pending_approval: "Pending Approval",
  issued: "Issued",
  disseminating: "Disseminating",
  acknowledged: "Acknowledged",
};

const PHASE_COLORS: Record<string, string> = {
  baseline: "#6b7280",
  rising: "#d97706",
  rate_rule_fired: "#dc2626",
  candidate: "#dc2626",
  pending_approval: "#ea580c",
  issued: "#b91c1c",
  disseminating: "#2563eb",
  acknowledged: "#16a34a",
};

export default function ReplayPage() {
  const {
    isReplaying,
    scenario,
    scenarios,
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
  } = useReplay();

  // Auto-select the Hunza/Shisper scenario if it's the only one published,
  // so testers don't have to click through a picker for a one-scenario MVP.
  useEffect(() => {
    if (!isReplaying && scenarios.length === 1) {
      loadScenario(scenarios[0].slug);
    }
  }, [isReplaying, scenarios, loadScenario]);

  if (!isReplaying || !scenario) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Replay Mode</h1>
        {scenarios.length === 0 && (
          <p style={{ color: "#6b7280" }}>
            No published scenarios found. Confirm the seed script ran and
            `replay_scenarios.is_published = true`.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => loadScenario(s.slug)}
              style={{
                textAlign: "left",
                padding: "12px 16px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "white",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {s.description}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                {s.district} · {formatDuration(s.duration_seconds)} real time · default {s.default_speed_multiplier}x
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const progressPct = (playbackSeconds / scenario.duration_seconds) * 100;
  const phase = currentFrame?.phase ?? "baseline";
  const phaseColor = PHASE_COLORS[phase] ?? "#6b7280";

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>{scenario.name}</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>{scenario.description}</p>
        </div>
        <button
          onClick={exitReplay}
          style={{
            fontSize: 13,
            padding: "6px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "white",
            cursor: "pointer",
          }}
        >
          Exit Replay
        </button>
      </div>

      {/* Phase badge + narration */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 8,
          background: "#f9fafb",
          border: `1px solid ${phaseColor}33`,
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            color: "white",
            background: phaseColor,
          }}
        >
          {PHASE_LABELS[phase] ?? phase}
        </span>
        <p style={{ marginTop: 8, fontSize: 14 }}>{currentFrame?.narration}</p>
      </div>

      {/* Scrubber */}
      <div style={{ marginTop: 20 }}>
        <input
          type="range"
          min={0}
          max={scenario.duration_seconds}
          step={1}
          value={playbackSeconds}
          onChange={(e) => seekToScenarioSeconds(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
          <span>{formatDuration(playbackSeconds)} into scenario</span>
          <span>{formatDuration(scenario.duration_seconds)} total</span>
        </div>
      </div>

      {/* Playback controls */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={isPlaying ? pause : play}
          style={{
            padding: "8px 20px",
            borderRadius: 6,
            border: "none",
            background: "#111827",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <label style={{ fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
          Speed
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
          >
            <option value={60}>60x</option>
            <option value={120}>120x</option>
            <option value={200}>200x</option>
            <option value={300}>300x</option>
          </select>
        </label>

        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {Math.round(progressPct)}% complete
        </span>
      </div>

      {/* Current frame readout — temporary, until wired into real map/alert components */}
      {currentFrame && (
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Station Reading</h2>
            <dl style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div>Water level: <strong>{currentFrame.frame_data.station.water_level_m} m</strong></div>
              <div>Rate of rise: <strong>{currentFrame.frame_data.station.rate_of_rise_m_per_hr} m/hr</strong></div>
              <div>Battery: {currentFrame.frame_data.station.battery_voltage} V</div>
              <div>RSSI: {currentFrame.frame_data.station.rssi_dbm} dBm</div>
              <div>Status: {currentFrame.frame_data.station.status}</div>
            </dl>
          </div>

          <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Alert</h2>
            {currentFrame.frame_data.alert ? (
              <dl style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>{currentFrame.frame_data.alert.event}</div>
                <div>Severity: <strong>{currentFrame.frame_data.alert.severity}</strong></div>
                <div>Urgency: {currentFrame.frame_data.alert.urgency}</div>
                <div>Certainty: {currentFrame.frame_data.alert.certainty}</div>
                <div>Status: {currentFrame.frame_data.alert.status}</div>
              </dl>
            ) : (
              <p style={{ fontSize: 13, color: "#9ca3af" }}>No alert yet.</p>
            )}
          </div>

          <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8, gridColumn: "1 / -1" }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Dissemination</h2>
            <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
              <div>Sent: <strong>{currentFrame.frame_data.dissemination.sent}</strong></div>
              <div>Delivered: <strong>{currentFrame.frame_data.dissemination.delivered}</strong></div>
              <div>Failed: <strong>{currentFrame.frame_data.dissemination.failed}</strong></div>
              <div>Acknowledged: <strong>{currentFrame.frame_data.dissemination.acknowledged}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}