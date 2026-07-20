"""
Seed Nowshera / Kabul River monsoon flood replay scenario (synthetic, FFD/GloFAS shaped).

Run after migration: python scripts/seed_replay_nowshera_flood.py
"""

import math
import os
import random

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env.local")
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit("Missing Supabase credentials in .env.local")

SCENARIO_SLUG = "nowshera-kabul-flood-2025"
DISTRICT = "Nowshera"
TOTAL_DURATION_S = 6 * 60 * 60  # 6 hours real time
DEFAULT_SPEED = 120  # ~3 min playback

random.seed(77)


def discharge_at(t: int) -> int:
    """Cusecs — slow rise then monsoon peak."""
    base = 85000
    if t < 2 * 3600:
        rise = t / (2 * 3600) * 40000
    elif t < 4 * 3600:
        rise = 40000 + ((t - 2 * 3600) / (2 * 3600)) * 90000
    else:
        rise = 130000 - ((t - 4 * 3600) / (2 * 3600)) * 20000
    return int(base + rise + random.randint(-2000, 2000))


def level_at(t: int) -> float:
    return round(4.2 + (discharge_at(t) / 200000) * 3.5, 2)


def phase_for(t: int) -> str:
    if t < 1.5 * 3600:
        return "monsoon_build"
    if t < 2.5 * 3600:
        return "ffd_watch"
    if t < 3.5 * 3600:
        return "glofas_exceedance"
    if t < 4.5 * 3600:
        return "flood_warning"
    if t < 5.0 * 3600:
        return "candidate"
    if t < 5.25 * 3600:
        return "pending_approval"
    if t < 5.5 * 3600:
        return "issued"
    if t < 5.75 * 3600:
        return "disseminating"
    return "acknowledged"


def ffd_risk(t: int) -> str:
    d = discharge_at(t)
    if d > 180000:
        return "exceptionally high"
    if d > 150000:
        return "very high"
    if d > 120000:
        return "high"
    if d > 100000:
        return "medium"
    return "low"


def narration(phase: str) -> str:
    return {
        "monsoon_build": "Monsoon rains building in Kabul basin — Nowshera gauge rising within seasonal norms.",
        "ffd_watch": "PMD FFD places Kabul at Nowshera on watch — discharge crossing 120k cusecs.",
        "glofas_exceedance": "GloFAS 5-year return period exceeded upstream of Nowshera bridge.",
        "flood_warning": "Riverine flood warning — low-lying areas along Kabul River at risk.",
        "candidate": "Alert candidate generated from combined FFD + GloFAS exceedance.",
        "pending_approval": "Duty officer reviewing CAP draft for Nowshera district.",
        "issued": "Flood warning issued — dissemination to downstream communities starting.",
        "disseminating": "SMS and WhatsApp channels active — sirens in Nowshera tehsil.",
        "acknowledged": "District focal points acknowledging flood warning.",
    }[phase]


def dissemination(t: int) -> dict:
    phase = phase_for(t)
    if phase in ("monsoon_build", "ffd_watch", "glofas_exceedance", "flood_warning", "candidate", "pending_approval"):
        return {"sent": 0, "delivered": 0, "failed": 0, "acknowledged": 0}
    total = 6200
    if phase == "issued":
        p = 0.08
    elif phase == "disseminating":
        p = min(1.0, 0.15 + (t - 5.5 * 3600) / 1800)
    else:
        p = 1.0
    sent = int(total * p)
    failed = int(sent * 0.02)
    delivered = sent - failed
    ack = int(delivered * min(1.0, max(0, p - 0.2) / 0.8)) if p > 0.2 else 0
    return {"sent": sent, "delivered": delivered, "failed": failed, "acknowledged": ack}


def build_frame(t: int) -> dict:
    phase = phase_for(t)
    discharge = discharge_at(t)
    risk = ffd_risk(t)

    alert = None
    hazard = {
        "title": f"Kabul River flood risk at Nowshera — {risk}",
        "severity": "Warning" if risk in ("high", "medium") else "Emergency",
        "source": "ffd|glofas",
    }
    if phase not in ("monsoon_build",):
        hazard["severity"] = "Emergency" if discharge > 150000 else "Warning"

    if phase not in ("monsoon_build", "ffd_watch", "glofas_exceedance"):
        alert = {
            "event": "Riverine Flood Warning — Kabul at Nowshera",
            "severity": "Emergency" if phase in ("issued", "disseminating", "acknowledged") else "Warning",
            "urgency": "Immediate",
            "certainty": "Likely" if phase == "flood_warning" else "Observed",
            "area": DISTRICT,
            "status": {
                "flood_warning": "candidate_pending",
                "candidate": "candidate",
                "pending_approval": "pending_approval",
                "issued": "issued",
                "disseminating": "issued",
                "acknowledged": "issued",
            }.get(phase, "draft"),
        }

    return {
        "t_offset_seconds": t,
        "phase": phase,
        "narration": narration(phase),
        "frame_data": {
            "gauge": {
                "name": "Kabul River — Nowshera Bridge Gauge",
                "river": "Kabul",
                "district": DISTRICT,
                "level_m": level_at(t),
                "discharge_cusecs": discharge,
                "ffd_risk_level": risk,
                "lat": 34.01,
                "lon": 71.98,
            },
            "hazard": hazard,
            "alert": alert,
            "dissemination": dissemination(t),
            "map_overlays": {
                "glofas_exceedance": "5yr" if phase in ("glofas_exceedance", "flood_warning", "candidate", "pending_approval", "issued", "disseminating", "acknowledged") else None,
            },
        },
    }


def main():
    supabase = create_client(SUPABASE_URL, SERVICE_KEY)
    res = supabase.table("replay_scenarios").upsert(
        {
            "slug": SCENARIO_SLUG,
            "name": "Nowshera Kabul Flood (2025 Monsoon)",
            "description": (
                "Synthetic replay shaped on archived FFD river discharge classifications and "
                "GloFAS exceedance patterns for the 2025 monsoon at Nowshera. Demonstrates "
                "riverine flood watch → warning → CAP issue → dissemination."
            ),
            "hazard_type": "flood",
            "district": DISTRICT,
            "duration_seconds": TOTAL_DURATION_S,
            "default_speed_multiplier": DEFAULT_SPEED,
            "is_published": True,
        },
        on_conflict="slug",
    ).execute()
    scenario_id = res.data[0]["id"]
    supabase.table("replay_frames").delete().eq("scenario_id", scenario_id).execute()

    frames = []
    t = 0
    while t <= TOTAL_DURATION_S:
        frames.append(build_frame(t))
        step = 600 if t < 2 * 3600 else 300
        t += step

    rows = [{**f, "scenario_id": scenario_id} for f in frames]
    for i in range(0, len(rows), 100):
        supabase.table("replay_frames").insert(rows[i : i + 100]).execute()

    print(f"Seeded '{SCENARIO_SLUG}' with {len(rows)} frames.")


if __name__ == "__main__":
    main()
