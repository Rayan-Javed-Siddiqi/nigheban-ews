"""
scripts/seed_replay_hunza_shisper.py

Step 4.4 — Replay Mode: seed data for the Hunza/Shisper GLOF scenario.

Generates a full event timeline compressed into a ~4-minute playback at the
scenario's default 120x speed (8 real-world hours -> 240 playback seconds),
matching the narrative from the original 6-Day plan:

    Lake rise -> station detects surge -> rate rule fires -> Alert Candidate
    -> Approval -> Issued -> Dissemination -> Acknowledgements

Data is synthetic but shaped like real GLOF progression: slow baseline rise,
an accelerating surge phase, a clear rate-of-rise threshold breach, then the
human/ops workflow phases. Clearly labeled as synthetic in the scenario
description — per the MVP plan's "real data wherever it exists; simulator
for the one closed system (GLOF telemetry)" approach, since field-station
GLOF telemetry isn't a live feed you have access to.

Run:
    python scripts/seed_replay_hunza_shisper.py

Requires (per Step 1.4 — no hardcoded credentials):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
in your environment / .env.
"""

import os
import math
import random
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

# Next.js convention: secrets live in .env.local, not .env.
# load_dotenv() with no args only looks for a file literally named ".env",
# so point it explicitly at .env.local (falls back to default search if
# that file isn't found, so this still works if you rename things later).
load_dotenv(".env.local")
load_dotenv()  # also pick up a plain .env if you add one later

# Accept either the plain server-side name or the NEXT_PUBLIC_-prefixed one,
# since this project already uses the latter for the browser client.
SUPABASE_URL_VALUE = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY_VALUE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL_VALUE or not SERVICE_KEY_VALUE:
    raise SystemExit(
        "Missing Supabase credentials.\n"
        "Checked .env.local and .env for SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL "
        "and SUPABASE_SERVICE_ROLE_KEY.\n"
        f"Found URL: {'yes' if SUPABASE_URL_VALUE else 'no'}, "
        f"Found service role key: {'yes' if SERVICE_KEY_VALUE else 'no'}"
    )

DB_URL = SUPABASE_URL_VALUE
SERVICE_KEY = SERVICE_KEY_VALUE

SCENARIO_SLUG = "hunza-shisper-glof"
STATION_NAME = "Shisper Glacier Lake — Station HZ-07"
DISTRICT = "Hunza"

# Real-world timeline this scenario represents, in seconds.
TOTAL_DURATION_S = 8 * 60 * 60  # 8 hours
DEFAULT_SPEED_MULTIPLIER = 120  # -> ~4 minutes of playback

random.seed(42)  # deterministic output so re-runs don't drift


def water_level_at(t: int) -> float:
    """
    Baseline lake level with a slow rise, then an accelerating surge
    starting ~5.5 hours in (the GLOF onset), tapering as the alert/response
    phases proceed. Meters, arbitrary baseline of 12.0m.
    """
    baseline = 12.0
    slow_rise = 0.02 * (t / 3600)  # gentle rise all day, ~0.16m over 8h
    if t < 5.5 * 3600:
        surge = 0
    else:
        hours_into_surge = (t - 5.5 * 3600) / 3600
        # Accelerating rise, tapering after ~2h as outflow/breach stabilizes
        surge = 3.2 * (1 - math.exp(-hours_into_surge * 1.4))
    noise = random.uniform(-0.02, 0.02)
    return round(baseline + slow_rise + surge + noise, 3)


def rate_of_rise(t: int, dt: int = 900) -> float:
    """Meters/hour, computed from the level curve."""
    return round((water_level_at(t) - water_level_at(max(0, t - dt))) * (3600 / dt), 3)


def phase_for(t: int) -> str:
    if t < 5.5 * 3600:
        return "baseline" if t < 5 * 3600 else "rising"
    if t < 5.75 * 3600:
        return "rate_rule_fired"
    if t < 6.0 * 3600:
        return "candidate"
    if t < 6.25 * 3600:
        return "pending_approval"
    if t < 6.5 * 3600:
        return "issued"
    if t < 7.5 * 3600:
        return "disseminating"
    return "acknowledged"


def narration_for(phase: str) -> str:
    return {
        "baseline": "Station HZ-07 reporting normal lake levels.",
        "rising": "Lake level rising gradually — within expected seasonal range so far.",
        "rate_rule_fired": "Rate-of-rise threshold breached at Station HZ-07 — automatic Alert Candidate rule triggered.",
        "candidate": "Alert Candidate generated: GLOF risk, Hunza district, Shisper glacier lake.",
        "pending_approval": "Alert drafted and routed to Duty Officer for approval.",
        "issued": "Alert approved and issued — CAP XML/JSON generated, dissemination beginning.",
        "disseminating": "Dissemination in progress across SMS, WhatsApp, and App Push channels.",
        "acknowledged": "Acknowledgements arriving from district focal points and downstream communities.",
    }[phase]


def dissemination_counts(t: int) -> dict:
    """Ramp delivered/failed/acknowledged counts during the response phases."""
    phase = phase_for(t)
    if phase in ("baseline", "rising", "rate_rule_fired", "candidate", "pending_approval"):
        return {"sent": 0, "delivered": 0, "failed": 0, "acknowledged": 0}

    total_recipients = 480  # downstream population proxy for this valley segment
    if phase == "issued":
        progress = 0.05
    elif phase == "disseminating":
        elapsed_in_phase = t - 6.5 * 3600
        progress = min(1.0, 0.1 + elapsed_in_phase / (1.0 * 3600))
    else:  # acknowledged
        progress = 1.0

    sent = int(total_recipients * progress)
    failed = int(sent * 0.03)
    delivered = sent - failed
    ack_progress = max(0.0, progress - 0.3) / 0.7 if progress > 0.3 else 0.0
    acknowledged = int(delivered * min(1.0, ack_progress))

    return {"sent": sent, "delivered": delivered, "failed": failed, "acknowledged": acknowledged}


def build_frame(t: int) -> dict:
    level = water_level_at(t)
    rate = rate_of_rise(t)
    phase = phase_for(t)

    alert_object = None
    if phase not in ("baseline", "rising"):
        alert_object = {
            "event": "Glacial Lake Outburst Flood (GLOF) Risk",
            "severity": "Extreme" if phase in ("issued", "disseminating", "acknowledged") else "Severe",
            "urgency": "Immediate",
            "certainty": "Observed" if rate > 1.0 else "Likely",
            "area": DISTRICT,
            "status": {
                "rate_rule_fired": "candidate_pending",
                "candidate": "candidate",
                "pending_approval": "pending_approval",
                "issued": "issued",
                "disseminating": "issued",
                "acknowledged": "issued",
            }[phase],
        }

    return {
        "t_offset_seconds": t,
        "phase": phase,
        "narration": narration_for(phase),
        "frame_data": {
            "station": {
                "name": STATION_NAME,
                "district": DISTRICT,
                "water_level_m": level,
                "rate_of_rise_m_per_hr": rate,
                "battery_voltage": round(12.6 - (t / TOTAL_DURATION_S) * 0.4, 2),
                "rssi_dbm": -1 * random.randint(55, 75),
                "status": "online",
            },
            "alert": alert_object,
            "dissemination": dissemination_counts(t),
        },
    }


def main():
    supabase = create_client(DB_URL, SERVICE_KEY)

    # Upsert the scenario
    scenario_res = (
        supabase.table("replay_scenarios")
        .upsert(
            {
                "slug": SCENARIO_SLUG,
                "name": "Hunza / Shisper GLOF",
                "description": (
                    "Synthetic scenario: accelerating glacial lake rise at the Shisper "
                    "field station triggers a rate-of-rise alert rule, followed by the "
                    "full approval, issuance, dissemination, and acknowledgement workflow. "
                    "Station telemetry is simulated (per MVP plan — GLOF field telemetry "
                    "is the one closed data source); the alert workflow logic is real."
                ),
                "hazard_type": "glof",
                "district": DISTRICT,
                "duration_seconds": TOTAL_DURATION_S,
                "default_speed_multiplier": DEFAULT_SPEED_MULTIPLIER,
                "is_published": True,
            },
            on_conflict="slug",
        )
        .execute()
    )
    scenario_id = scenario_res.data[0]["id"]

    # Clear any previously seeded frames for a clean re-run
    supabase.table("replay_frames").delete().eq("scenario_id", scenario_id).execute()

    # Frame resolution: coarse during baseline, fine during the surge + response
    frames = []
    t = 0
    while t <= TOTAL_DURATION_S:
        frames.append(build_frame(t))
        if t < 5 * 3600:
            step = 900       # 15 min during quiet baseline
        elif t < 7.5 * 3600:
            step = 300       # 5 min through surge + response phases
        else:
            step = 600       # 10 min during the acknowledgement tail
        t += step

    rows = [{**f, "scenario_id": scenario_id} for f in frames]

    # Batch insert
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        supabase.table("replay_frames").insert(rows[i : i + batch_size]).execute()

    print(f"Seeded scenario '{SCENARIO_SLUG}' ({scenario_id}) with {len(rows)} frames.")
    print(f"Phases covered: {sorted(set(f['phase'] for f in frames))}")


if __name__ == "__main__":
    main()