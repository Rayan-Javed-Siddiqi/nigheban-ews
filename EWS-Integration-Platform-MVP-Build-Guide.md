# Multi-Hazard EWS Integration Platform — MVP Build Guide

**Document owner:** CTO Office, Finova Solutions
**Version:** 1.0 — 08 July 2026
**Scope:** Technical build only. Covers data sources, architecture, data model, module specs, build phases, and demo scenario. No commercial content.

---

## 1. Product Definition

**Working name:** `Nigheban` (نگہبان) — Provincial Multi-Hazard EWS Integration & Operations Platform.

A single operational console that ingests live hazard data (flood, GLOF, fire, drought, earthquake, weather) from public feeds and field sensor networks, normalizes everything to the **CAP 1.2 (Common Alerting Protocol)** standard, monitors sensor network health, runs threshold-based alert candidates through a human-in-the-loop approval flow, and disseminates + audits every warning down to district/tehsil level.

**MVP scope boundary:** one province-equivalent region (KP, with Chitral + Swat as focus districts; GB with Hunza as secondary), 5 hazard types, real data where feeds exist, high-fidelity simulation where systems are closed (GLOF sensor telemetry).

**The three demo-winning capabilities, in priority order:**

1. **Unified hazard picture** — one map, all hazards, district-level drill-down, live data.
2. **Sensor network health** — uptime/battery/last-transmission panel for field EWS stations. Nobody else shows this; it directly answers the "installed hardware rots after handover" problem.
3. **CAP-compliant alert composer with audit trail** — draft → approve → disseminate → acknowledge, every step logged append-only.

---

## 2. Data Source Catalog

### 2.1 Live sources — integrate for real

| # | Source | Hazard | Access method | Cadence | Auth/Cost | MVP use |
|---|--------|--------|--------------|---------|-----------|---------|
| S1 | **Google Flood Forecasting API** — `floodforecasting.googleapis.com/v1` | Riverine flood | REST/JSON. `gauges:searchGaugesByArea` (by region code `PK` or polygon loop), `floodStatus:searchLatestFloodStatusByArea`, hydrologic forecasts up to 7 days. Covers 150+ countries incl. Pakistan; verified + virtual (HYBAS) gauges; set `includeNonQualityVerified=true` for mountain coverage. | Flood status updated several times daily; forecasts daily | Free, CC BY 4.0. Waitlist form → approval email → attach GCP Project ID. **Apply on day 1 — this is the only gated item.** | Primary flood forecast layer. Gauge pins with warning/danger levels + 7-day discharge forecast charts per gauge. Do not cache gauge lists >24h. |
| S2 | **GloFAS via Copernicus Early Warning Data Store (EWDS)** — `ewds.climate.copernicus.eu` | Riverine flood (15-day) | Python `cdsapi` client (dataset `cems-glofas-forecast`); GRIB/NetCDF gridded discharge + flood thresholds; also **WMS-T** map layers from `global-flood.emergency.copernicus.eu` that can be dropped straight into MapLibre as tile overlays. | Daily forecast cycle | Free ECMWF account + API token | Secondary/validation flood layer + the WMS-T overlay is a cheap visual win (probability of exceeding 5/20-year return period). |
| S3 | **PMD Flood Forecasting Division (FFD Lahore)** — `ffd.pmd.gov.pk` | Flood (official govt) | **No API — scrape.** Structured HTML pages: `/river-flows-comparison` (latest river flows), rainfall data, reservoir status (Tarbela/Mangla), daily bulletins + flood warnings (HTML/PDF), WRF/GFS/ICON precip forecasts. Site updates daily 10:00–12:00 PKT or on abrupt basin changes. | Daily + event-driven | Free, public | **The credibility source.** Officials trust PMD numbers over Google's. Scraper → parse river discharge table (Indus/Kabul/Swat/Chenab etc., flow in cusecs + flood classification low/medium/high/very high/exceptionally high). Show FFD bulletin text verbatim in the console. |
| S4 | **IRSA Daily Data** — `pakirsa.gov.pk/DailyData.aspx` | Flood/water | Scrape (ASP.NET page). Daily reservoir inflows/outflows, levels for Tarbela, Mangla, Chashma. | Daily | Free, public | Reservoir panel. Cross-check against FFD. |
| S5 | **NASA FIRMS** — `firms.modaps.eosdis.nasa.gov/api` | Wildfire | REST, CSV/GeoJSON. `/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/{days}` — bbox for KP/GB (approx `69.2,31.5,77.9,37.1`). VIIRS 375m + MODIS 1km hotspots. | ~3h latency, multiple passes/day | Free MAP_KEY (instant email signup), 5000 tx/10min limit | Fire hazard layer. Cluster hotspots, flag detections within forest districts (Swat, Shangla, Dir, Diamer — Diamer fires were national news). Confidence + FRP fields drive severity. |
| S6 | **USGS Earthquake Hazards Program** — `earthquake.usgs.gov/earthquakes/feed/v1.0/` | Earthquake | Public GeoJSON feeds (`all_hour.geojson`, `all_day.geojson`, `4.5_week.geojson`) or FDSN query API with bbox + minmagnitude. No auth. | Real-time (minutes) | Free, no key | Earthquake layer filtered to Pakistan bbox + 300km buffer. M≥4.5 auto-creates a hazard event. Simplest integration — build first as the pipeline's hello-world. |
| S7 | **Open-Meteo** — `api.open-meteo.com/v1/forecast` | Weather / heavy-rain trigger / heatwave | REST/JSON, no key, free for non-commercial demo. Hourly precip, temp, snowfall, wind for any lat/lon; 16-day horizon; also historical API. | Hourly model updates | Free, no key | Per-district weather strip + rain-accumulation threshold triggers (e.g., >50mm/24h forecast in Chitral catchment → advisory candidate). Fallback where PMD granularity is missing. |
| S8 | **CHIRPS rainfall via ClimateSERV API** — `climateserv.servirglobal.net` | Drought | REST API: submit polygon (district geojson) + dataset (CHIRPS) → precipitation time series. Compute **SPI-1/SPI-3** in-platform per district against 1981–present climatology. | Pentad/monthly | Free | Drought monitor: district choropleth of SPI-3, classification (D0–D4 style). Drought is slow — a monthly-updating layer is fully adequate and demos well for southern KP (D.I. Khan, Tank) and GB rain-shadow valleys. |
| S9 | **NOAA STAR Vegetation Health Index (VHI)** | Drought (vegetation stress) | Weekly global GeoTIFF/netCDF download, clip to province | Weekly | Free | Second drought indicator alongside SPI. Optional if time-boxed. |
| S10 | **Copernicus Global Flood Monitoring (GFM)** | Flood extent (observed) | Sentinel-1 SAR-derived flood extent; OGC WMS-T layers + push notification service | Per S1 overpass (~1–3 days) | Free registration | Post-event "observed inundation" overlay — powerful in replay demo of a real flood. |
| S11 | **NDMA / PDMA advisories** — `ndma.gov.pk`, PDMA KP, GB-DMA sites | All (official alerts) | Scrape advisory/press pages; NDMA NEOC issues color-coded alerts (also pushed via Pak NDMA app). No public CAP feed. | Event-driven | Free, public | Ingest as inbound CAP-normalized advisories so the console shows "what the federal level has issued" next to our own alert pipeline. Also proves interop story. |
| S12 | **NASA GIBS/Worldview tiles** | Basemap overlays | XYZ/WMTS tiles (MODIS true color, snow cover NDSI) | Daily | Free, no key | Snow-cover overlay for GLOF-season context; true-color for event days. Pure frontend addition. |
| S13 | **Admin boundaries — OCHA HDX Pakistan admin0–3** | — | One-time shapefile/GeoJSON download (district + tehsil polygons) | Static | Free | Foundation for every choropleth, district filter, and geofenced alert. Load into PostGIS on day 1. |

### 2.2 Simulated sources — mock to spec (closed systems)

| # | Source | Why mocked | Simulation approach |
|---|--------|-----------|---------------------|
| M1 | **GLOF-II field station telemetry** (~284 community EWS stations across 24 valleys of KP/GB: water-level sensors, AWS, rain gauges, discharge sensors — CAE S.p.A hardware handed over to PDMAs) | Vendor-proprietary, no public feed; PDMA-internal | Build a **station simulator service**: registry of stations with real valley names/coordinates (Bagrote, Bindo Gol, Reshun, Golen Gol, Hassanabad/Shisper, Badswat, Darkut — all documented GLOF-II sites), emitting telemetry every 10–15 min: water level (m), flow rate, rainfall, air temp, battery voltage, RSSI. Inject realistic failure modes: 12–18% of stations offline, low-battery drift, stale transmissions. **This simulator IS the product demo for the sensor-health module — make it indistinguishable from a real feed (same ingestion path, MQTT/HTTP, CAP-ready).** |
| M2 | **Dissemination endpoints** (bulk SMS via telco, siren activation, mosque loudspeaker phone tree) | No telco integration at MVP stage | SMS: Twilio sandbox (or log-only "dry-run" mode showing exactly what would be sent, to whom, in Urdu + English). Sirens/loudspeakers: status board with simulated acknowledgments. WhatsApp: actual send to a demo group via WhatsApp Business API is feasible and impressive — optional. |
| M3 | **Glacial lake levels / GLOF risk index** | SUPARCO/ICIMOD lake inventories are periodic reports, not feeds | Static risk register of the 33 hazardous glacial lakes (from published UNDP/ICIMOD inventories) with attributes (lake, valley, district, risk class, downstream population). Rendered as a risk layer; the simulator (M1) references these lakes for GLOF-scenario telemetry. |

### 2.3 Source integration priority

```
Week 1:  S13 (boundaries) → S6 (USGS, pipeline hello-world) → S7 (Open-Meteo)
Week 2:  S5 (FIRMS) → S3 (FFD scraper) → S4 (IRSA scraper) → M1 (station simulator)
Week 3:  S1 (Google Flood API — assuming waitlist approved) → S2 (GloFAS WMS-T overlay)
Week 4:  S8 (CHIRPS/SPI) → S11 (NDMA advisory scraper) → S12 (GIBS overlays)
Optional: S2 full cdsapi ingestion, S9, S10
```

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER (Python workers, cron / event-driven)          │
│  one adapter per source → normalize → validate → write          │
│  adapters: usgs, openmeteo, firms, ffd_scraper, irsa_scraper,   │
│            gfloodapi, glofas_wms, chirps, ndma_scraper,         │
│            station_sim (MQTT/HTTP intake — same path real       │
│            hardware would use)                                   │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│  DATA LAYER — Supabase (Postgres + PostGIS + Realtime)          │
│  timeseries: observations (partitioned by month)                │
│  spatial: districts, stations, hazard_events, glacial_lakes     │
│  alerting: alert (CAP 1.2 JSON), alert_delivery, ack            │
│  ops: station_health (materialized), audit_log (append-only)    │
│  RLS default-deny; roles: dg, duty_officer, district_focal,     │
│  viewer                                                          │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│  RULES / ALERT ENGINE (worker + pg functions)                   │
│  threshold definitions per station/gauge/district/hazard        │
│  → alert_candidate → human approval (duty officer) →            │
│  CAP 1.2 alert issued → dissemination fan-out → ack tracking    │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│  CONSOLE — Next.js 14 + MapLibre GL JS + deck.gl                │
│  Views: Provincial Overview · District Console · Station Health │
│  · Alert Composer · Dissemination Board · Audit & Reports ·     │
│  Replay Mode                                                     │
│  Realtime via Supabase channels; Urdu/English i18n; responsive  │
│  down to tablet (DC offices)                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Stack decisions (aligned with existing Finova patterns):**

- **Supabase** — same as Awaaz Labs/Sirius stack; RLS default-deny and append-only audit patterns are already solved in-house. Self-hostable later (govt data-residency requirement is inevitable — architect for it now: no service that can't run in-country).
- **Ingestion workers:** Python 3.12 (`httpx`, `beautifulsoup4`/`selectolax` for scrapers, `cdsapi`, `xarray`+`cfgrib` for GRIB, `rasterio` for GeoTIFF clipping). Deploy as scheduled jobs (Railway/Fly cron or a single VM with systemd timers — keep it boring).
- **Station simulator:** standalone service publishing over MQTT (Mosquitto) with an HTTP fallback — chosen because real hydromet telemetry (CAE, Sutron, OTT) speaks MQTT/FTP/HTTP-push; the ingestion path must not change when real hardware connects.
- **Frontend:** Next.js + MapLibre GL (no Mapbox token dependency — air-gapped deployability) + deck.gl for hotspot/heatmap layers; Recharts for gauge/discharge time series; `next-intl` for Urdu (RTL) + English.
- **CAP 1.2** implemented as a JSONB column validated against schema, with XML export endpoint (`/api/alerts/{id}/cap.xml`) — WMO/ITU standard format; interop with any national system is a first-class claim.

---

## 4. Data Model (core DDL sketch)

```sql
-- Spatial foundation
create table district (
  id uuid primary key default gen_random_uuid(),
  adm2_code text unique not null,        -- OCHA HDX code
  name_en text not null, name_ur text,
  province text not null check (province in ('KP','GB')),
  geom geometry(MultiPolygon, 4326) not null,
  population int
);

create table station (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,               -- vendor/station code
  kind text not null check (kind in
    ('water_level','aws','rain_gauge','discharge','river_gauge_virtual')),
  source text not null,                  -- 'glof2_sim','google_flood','pmd_ffd',...
  name text not null, valley text, district_id uuid references district,
  geom geometry(Point,4326) not null,
  install_date date, hardware text,      -- e.g. 'CAE compact station'
  is_simulated boolean not null default false,
  meta jsonb default '{}'
);

-- Timeseries (partition by month)
create table observation (
  id bigint generated always as identity,
  station_id uuid not null references station,
  observed_at timestamptz not null,
  parameter text not null,               -- 'water_level_m','discharge_cusecs',
                                         -- 'rain_mm','temp_c','battery_v','rssi_dbm'
  value double precision not null,
  quality text default 'good',
  primary key (station_id, parameter, observed_at)
) partition by range (observed_at);

-- Hazard events (any source, any hazard)
create table hazard_event (
  id uuid primary key default gen_random_uuid(),
  hazard text not null check (hazard in
    ('flood','glof','fire','drought','earthquake','weather','landslide')),
  source text not null,
  severity text not null check (severity in
    ('advisory','watch','warning','emergency')),
  title text not null, description text,
  geom geometry(Geometry,4326),
  district_ids uuid[],
  starts_at timestamptz, ends_at timestamptz,
  raw jsonb, created_at timestamptz default now()
);

-- Thresholds and alerting
create table threshold_rule (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references station,    -- or district-level rule
  district_id uuid references district,
  hazard text not null, parameter text not null,
  operator text not null check (operator in ('gt','gte','lt','rate_gt')),
  value double precision not null,
  window_minutes int,                    -- for rate rules (GLOF surge = rate)
  severity text not null, enabled boolean default true
);

create table alert (
  id uuid primary key default gen_random_uuid(),
  cap jsonb not null,                    -- full CAP 1.2 structure
  status text not null default 'draft' check (status in
    ('candidate','draft','pending_approval','issued','cancelled','expired')),
  hazard text not null, severity text not null,
  district_ids uuid[] not null,
  created_by uuid, approved_by uuid,
  issued_at timestamptz,
  source_event uuid references hazard_event,
  source_rule uuid references threshold_rule
);

create table alert_delivery (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alert,
  channel text not null check (channel in
    ('sms','whatsapp','siren','loudspeaker','email','app_push')),
  recipient text not null,               -- msisdn / device / siren id
  district_id uuid references district,
  status text not null default 'queued' check (status in
    ('queued','sent','delivered','failed','acknowledged','dry_run')),
  status_at timestamptz default now(),
  ack_by text, ack_at timestamptz
);

-- Append-only audit (trigger-enforced: no update/delete grants)
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid, actor_role text,
  action text not null,                  -- 'alert.approved','threshold.changed',...
  entity text, entity_id text,
  detail jsonb
);

-- Sensor health (materialized view, refreshed every 5 min)
create materialized view station_health as
select s.id, s.name, s.valley, s.district_id, s.kind, s.is_simulated,
  max(o.observed_at) filter (where o.parameter not in ('battery_v','rssi_dbm'))
    as last_data_at,
  (select value from observation where station_id = s.id
     and parameter='battery_v' order by observed_at desc limit 1) as battery_v,
  case
    when max(o.observed_at) > now() - interval '30 minutes' then 'online'
    when max(o.observed_at) > now() - interval '6 hours' then 'degraded'
    else 'offline' end as status
from station s left join observation o on o.station_id = s.id
group by s.id;
```

---

## 5. Module Specifications

### M1 — Ingestion adapters
Each adapter is a self-contained job with the contract: `fetch() → parse() → upsert(observations | hazard_events)`, structured logging, per-source `last_success_at` heartbeat written to an `ingest_status` table (surfaced in the console footer — "PMD FFD: updated 42 min ago"). Scraper adapters (FFD, IRSA, NDMA) must be resilient: snapshot raw HTML to storage before parsing, alert on schema drift, never crash the pipeline. All timestamps normalized to UTC, displayed in PKT.

### M2 — Station Health (the differentiator)
- Grid + map view of all stations (simulated GLOF network + virtual Google gauges + PMD gauge points).
- Status chips: online / degraded / offline; battery bar; sparkline of last 24h transmissions.
- Roll-ups: "231/284 stations reporting (81%) · 19 low battery · 34 offline > 72h" with per-valley and per-district breakdown.
- Offline-station alert: auto-generate a maintenance ticket entry (simple table, not a full ticketing system) when a station goes offline > 24h.

### M3 — Hazard Console
- **Provincial Overview:** full-province map, all hazard layers toggleable, right rail of active hazard_events sorted by severity, KPI strip (active warnings, districts affected, population in warned areas — computed from district population × affected polygons).
- **District Console:** select district → weather strip (Open-Meteo), relevant gauges/stations, active alerts, hazard history, contact roster (DC/AC/focal persons — seeded demo data).
- **Layers:** flood gauges (S1) · GloFAS exceedance WMS (S2) · FFD river status (S3) · fire hotspots (S5) · earthquakes (S6) · drought SPI choropleth (S8) · glacial lake risk register (M3-mock) · snow cover (S12) · NDMA advisories (S11).

### M4 — Alert Engine + CAP Composer
- Rules evaluated on ingest (pg trigger or 1-min worker sweep). Rate-of-change rules are essential for GLOF (a 0.5m water-level rise in 15 min matters more than any absolute level).
- Rule fires → `alert.status='candidate'` → duty officer opens Composer: pre-filled CAP fields (event, urgency, severity, certainty, area polygon from district/valley, instruction text in EN + UR templates) → edit → submit for approval → DG/authorized role approves → status `issued`.
- Every transition writes `audit_log`. CAP XML export endpoint. One-click "escalate severity" and "cancel/all-clear" flows.

### M5 — Dissemination Board
- Fan-out on issue: resolve recipients per district (demo roster), create `alert_delivery` rows per channel.
- Dry-run mode default: shows the exact SMS text (160-char Urdu-aware segmentation), recipient counts, channel mix. Live mode wired to Twilio sandbox + optional WhatsApp Business demo group.
- Acknowledgment tracking: simulated field acks streaming in over 2–3 minutes (realtime channel) — this animates beautifully in a live demo.

### M6 — Audit & Reports
- Filterable audit trail; per-alert timeline view (candidate → issued → delivered → acknowledged, with timestamps and actors).
- One-page PDF "Post-Event Report" generator per alert (WeasyPrint — existing in-house pattern): what was detected, when, who approved, who was warned, ack rate.

### M7 — Replay Mode (the demo weapon)
- Time-slider that replays a historical event from stored observations at 60–300× speed.
- Ship with one scripted scenario: **"Hunza/Shisper GLOF replay"** — simulated station telemetry showing lake-level rise → surge detection → rate-rule fires → alert composed/approved → dissemination → acks, over a 4-minute replay. Secondary scenario: 2025 monsoon riverine flood using real archived FFD/GloFAS data for Kabul River at Nowshera.

---

## 6. Build Phases (8 weeks, 2 engineers + 1 on frontend)

| Phase | Weeks | Deliverables | Exit criteria |
|-------|-------|--------------|---------------|
| **P0 Foundations** | 1 | Supabase project, schema + RLS, boundaries loaded (S13), Next.js shell + MapLibre with district polygons, auth + 4 roles, USGS adapter live (S6) | Earthquake dot appears on map from live feed end-to-end |
| **P1 Ingestion core** | 2–3 | Open-Meteo (S7), FIRMS (S5), FFD scraper (S3), IRSA scraper (S4), station simulator (M1) publishing 300 stations over MQTT→ingest, `ingest_status` heartbeats | All sources visible on Provincial Overview with freshness indicators |
| **P2 Flood depth** | 3–4 | Google Flood API (S1) gauges + flood status + forecast charts; GloFAS WMS-T overlay (S2); NDMA advisory scraper (S11) | District Console for Chitral shows gauge forecast + FFD bulletin + NDMA advisory side by side |
| **P3 Health + Drought** | 4–5 | Station Health module complete (M2); CHIRPS→SPI pipeline + drought choropleth (S8); GIBS snow overlay (S12) | Health roll-up numbers correct against simulator ground truth |
| **P4 Alerting** | 5–6 | Threshold rules + rate rules, CAP Composer, approval flow, audit log, dissemination dry-run + Twilio sandbox, ack simulation | Full alert lifecycle executable in < 90 seconds by a non-engineer |
| **P5 Replay + Polish** | 7–8 | Replay Mode with Shisper GLOF + Nowshera flood scenarios; Urdu localization pass; PDF post-event report; performance (map < 2s load on 3G-throttled); seed data audit; demo script | Full 12-minute demo runs offline-tolerant on a laptop + projector with zero live-coding |

**Definition of done for MVP:** a stranger with a duty-officer login can, unassisted, (a) see all five hazards live, (b) identify which sensor stations are down, (c) take a fired threshold candidate to an issued, disseminated, acknowledged, audited alert — and we can replay a GLOF end-to-end in under 5 minutes.

---

## 7. Non-Functional Requirements

- **Low bandwidth:** console usable on 3G (map tiles cached, vector layers over raster where possible, no payload > 500KB per view).
- **Deployability:** everything runs on a single in-country VM (docker-compose profile) — no hard dependency on any service that can't be self-hosted. Google Flood API and GloFAS are enrichment layers, not core dependencies; the console degrades gracefully without them.
- **Localization:** Urdu (RTL) for all operator-facing alert text and district names; English for admin/config.
- **Security posture:** RLS default-deny, append-only audit (reuse Sirius HIPAA patterns), no PII beyond demo contact roster, secrets in env vault per Engineering Handbook.
- **Timezones:** store UTC, render PKT, label explicitly everywhere (a wrong timestamp in a warning demo is fatal).

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Google Flood API waitlist not approved in time | Apply day 1; GloFAS WMS-T + FFD scraper cover the flood story standalone |
| FFD/IRSA/NDMA site markup changes mid-build | Raw-HTML snapshots, parser drift alerts, manual-entry fallback form in admin |
| GRIB/NetCDF handling eats time (S2 full ingestion) | WMS-T overlay first (hours, not days); full cdsapi ingestion is stretch scope |
| Simulator looks fake under scrutiny | Base telemetry curves on published hydrographs of real GLOF events; label simulated stations honestly in admin view — credibility > illusion |
| Scope creep into forecasting/modelling | Hard rule: MVP integrates and operationalizes existing forecasts; it does not produce its own hydrological model |

## 9. Appendix — Quick Reference Endpoints

```
USGS       GET https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
Open-Meteo GET https://api.open-meteo.com/v1/forecast?latitude=35.85&longitude=71.78
             &hourly=precipitation,temperature_2m,snowfall&forecast_days=7
FIRMS      GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/69.2,31.5,77.9,37.1/2
GFlood     POST https://floodforecasting.googleapis.com/v1/gauges:searchGaugesByArea
             body: {"regionCode":"PK","includeNonQualityVerified":true}
           POST https://floodforecasting.googleapis.com/v1/floodStatus:searchLatestFloodStatusByArea
GloFAS     cdsapi → dataset 'cems-glofas-forecast' (EWDS account + token)
           WMS-T layers: https://global-flood.emergency.copernicus.eu (OGC WMS-T)
FFD        scrape https://ffd.pmd.gov.pk/river-flows-comparison ; /home bulletins
IRSA       scrape http://pakirsa.gov.pk/DailyData.aspx
ClimateSERV https://climateserv.servirglobal.net/api (CHIRPS by polygon)
HDX admin  https://data.humdata.org → "Pakistan administrative boundaries" (adm2/adm3)
GIBS       WMTS https://gibs.earthdata.nasa.gov (MODIS_Terra_NDSI_Snow_Cover, true color)
```
