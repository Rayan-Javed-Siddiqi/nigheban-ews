# Nigheban EWS Project Handoff

Purpose: this document gives Claude an accurate current-state audit of the repository, what is already implemented, what is partial, what is missing versus the MVP guide, and what to build next.

Workspace: c:\Users\Hi\nigheban-ews
Primary MVP reference: c:\Users\Hi\Downloads\Share EWS-Integration-Platform-MVP-Build-Guide (1).md
Audit date: 2026-07-19

---

## 1. Executive Snapshot

The project is a functional EWS operations platform, not a skeleton.

What works today:
- Locale-based dashboard app with major operational screens.
- Multi-layer hazard map using MapLibre + deck.gl.
- Station health monitoring + automatic offline maintenance ticketing.
- Alert candidate workflow through CAP editing and issuance states.
- CAP JSON and CAP XML exports.
- Dissemination dry-run + acknowledgement simulation.
- Audit viewing and a PDF generation route.
- Multiple ingest adapters and source freshness tracking.

What is still incomplete for the full MVP:
- Several key source integrations in the MVP matrix are missing.
- Replay mode is missing.
- Localization exists but is not complete across all operational copy.
- Schema and migration hygiene needs cleanup and alignment.

---

## 2. Current Architecture In Repo

Frontend stack currently used:
- Next.js App Router with locale segment under app/[locale].
- MapLibre + deck.gl + react-map-gl.
- next-intl for locale scaffolding.

Backend/data stack currently used:
- Supabase (Postgres + RLS + RPC-backed geojson endpoints).
- API routes for ingestion, alert lifecycle, simulation, and reporting.
- Cron endpoint for station-health ticket automation.

Evidence:
- [package.json](package.json)
- [app/[locale]/layout.tsx](app/[locale]/layout.tsx)
- [i18n.ts](i18n.ts)
- [app/api/cron/station-health/route.ts](app/api/cron/station-health/route.ts)

---

## 3. Implemented Modules

### 3.1 Provincial Operations Console
Status: Implemented

Includes:
- KPI strip and top-level operational stats.
- Main hazard map container.
- Advisories side feed.
- Ingest/source health strip.

Files:
- [app/[locale]/dashboard/page.tsx](app/[locale]/dashboard/page.tsx)
- [app/[locale]/dashboard/DashboardMap.tsx](app/[locale]/dashboard/DashboardMap.tsx)
- [app/[locale]/dashboard/AdvisoriesFeed.tsx](app/[locale]/dashboard/AdvisoriesFeed.tsx)
- [app/[locale]/dashboard/SourceHealthFooter.tsx](app/[locale]/dashboard/SourceHealthFooter.tsx)

### 3.2 Hazard Map Layers
Status: Implemented with partial source coverage

Implemented layers/surfaces include districts, hazards, drought, flood risk, glacial lakes, and snow overlay toggles.

Files:
- [app/[locale]/dashboard/DashboardMap.tsx](app/[locale]/dashboard/DashboardMap.tsx)
- [app/api/districts/route.ts](app/api/districts/route.ts)
- [app/api/hazards/route.ts](app/api/hazards/route.ts)
- [app/api/drought/route.ts](app/api/drought/route.ts)
- [app/api/flood-forecast/route.ts](app/api/flood-forecast/route.ts)
- [app/api/glacial-lakes/route.ts](app/api/glacial-lakes/route.ts)

### 3.3 Station Health
Status: Implemented

Includes:
- Station health dashboard KPIs.
- Map and table with telemetry-derived status.
- Battery and freshness indicators.
- Auto-create/auto-resolve maintenance tickets for stale/offline stations.

Files:
- [app/[locale]/dashboard/stations/page.tsx](app/[locale]/dashboard/stations/page.tsx)
- [app/[locale]/dashboard/stations/StationHealthMap.tsx](app/[locale]/dashboard/stations/StationHealthMap.tsx)
- [app/api/stations/route.ts](app/api/stations/route.ts)
- [app/api/cron/station-health/route.ts](app/api/cron/station-health/route.ts)

### 3.4 Station Simulator
Status: Implemented

Includes outage behavior and battery drift/replacement simulation, writing synthetic rows to station readings.

Files:
- [app/api/simulate/stations/route.ts](app/api/simulate/stations/route.ts)

### 3.5 District Console
Status: Implemented but partially placeholder-driven

Includes:
- District summary and contacts.
- Weather surface.
- Manual readings.
- Hazards, advisories, ingest status.
- PMD manual fallback section.

Files:
- [app/[locale]/dashboard/district/[id]/page.tsx](app/[locale]/dashboard/district/[id]/page.tsx)
- [app/[locale]/dashboard/district/[id]/ManualEntryForm.tsx](app/[locale]/dashboard/district/[id]/ManualEntryForm.tsx)
- [app/api/districts/[id]/route.ts](app/api/districts/[id]/route.ts)

### 3.6 Alert Lifecycle and CAP Composer
Status: Implemented with validation/workflow issues to fix

Includes:
- Candidate listing and status sorting.
- CAP field editor.
- Status transitions.
- CAP export endpoints.
- Audit timeline section in composer.

Files:
- [app/[locale]/dashboard/alerts/page.tsx](app/[locale]/dashboard/alerts/page.tsx)
- [app/[locale]/dashboard/alerts/[id]/page.tsx](app/[locale]/dashboard/alerts/[id]/page.tsx)
- [app/api/alerts/[id]/cap.json/route.ts](app/api/alerts/[id]/cap.json/route.ts)
- [app/api/alerts/[id]/cap.xml/route.ts](app/api/alerts/[id]/cap.xml/route.ts)

### 3.7 Dissemination and Acknowledgements
Status: Implemented as demo dry-run flow

Includes:
- Channel breakdown from recipient count table.
- Dispatch dry-run insertion.
- Realtime-like status advancement via simulation endpoint.

Files:
- [app/[locale]/dashboard/alerts/[id]/dissemination/page.tsx](app/[locale]/dashboard/alerts/[id]/dissemination/page.tsx)
- [app/[locale]/dashboard/alerts/[id]/dissemination-actions.ts](app/[locale]/dashboard/alerts/[id]/dissemination-actions.ts)
- [app/[locale]/dashboard/alerts/[id]/dissemination/ack-simulator.tsx](app/[locale]/dashboard/alerts/[id]/dissemination/ack-simulator.tsx)
- [app/api/alerts/[id]/simulate-ack/route.ts](app/api/alerts/[id]/simulate-ack/route.ts)

### 3.8 Audit and Reporting
Status: Partial

Implemented:
- Audit page exists.
- PDF generation API route exists (puppeteer-based).

Not yet MVP-complete:
- Report generation is currently browser-page PDF style, not a dedicated structured post-event report pipeline.

Files:
- [app/[locale]/dashboard/audit/page.tsx](app/[locale]/dashboard/audit/page.tsx)
- [app/api/report/generate/route.ts](app/api/report/generate/route.ts)
- [app/[locale]/dashboard/alerts/[id]/PrintButton.tsx](app/[locale]/dashboard/alerts/[id]/PrintButton.tsx)

### 3.9 Ingestion Adapters in Runtime App
Status: Partial against full MVP source catalog

Implemented runtime adapters:
- USGS earthquakes.
- Open-Meteo weather.
- Open-Meteo flood proxy.
- FIRMS fire points.
- PMD snapshot capture route.
- IRSA PDF fetch/parse route.

Files:
- [app/api/ingest/usgs/route.ts](app/api/ingest/usgs/route.ts)
- [app/api/ingest/open-meteo/route.ts](app/api/ingest/open-meteo/route.ts)
- [app/api/ingest/flood-open-meteo/route.ts](app/api/ingest/flood-open-meteo/route.ts)
- [app/api/ingest/firms/route.ts](app/api/ingest/firms/route.ts)
- [app/api/ingest/pmd-snapshot/route.ts](app/api/ingest/pmd-snapshot/route.ts)
- [app/api/ingest/irsa/route.ts](app/api/ingest/irsa/route.ts)

Support scripts exist for additional ingestion but are not fully integrated as production app routes/cron:
- [scripts/scrape_advisories.py](scripts/scrape_advisories.py)
- [scripts/ingest_chirps_drought.py](scripts/ingest_chirps_drought.py)

### 3.10 Localization
Status: Partially implemented

Implemented:
- Locale routing structure and html dir switching.
- next-intl wiring and message files.

Remaining:
- Much of operator-facing dashboard copy is still hardcoded and not fully localized.

Files:
- [app/[locale]/layout.tsx](app/[locale]/layout.tsx)
- [i18n.ts](i18n.ts)
- [messages/en.json](messages/en.json)
- [messages/ur.json](messages/ur.json)

---

## 4. Remaining Work Versus MVP Guide

### 4.1 High-priority missing capabilities

- Google Flood Forecasting API integration (runtime adapter + map/console surfaces).
- GloFAS EWDS ingestion and/or GloFAS WMS-T map overlay.
- NDMA/PDMA advisories as integrated runtime source (not just script tooling).
- CHIRPS-based SPI pipeline as first-class runtime flow.
- Replay mode module with scripted scenarios (Hunza/Shisper and secondary flood replay).

### 4.2 Optional/stretched in MVP file but still missing

- NOAA VHI ingestion.
- Copernicus Global Flood Monitoring overlay.

### 4.3 Product completeness gaps

- End-to-end “official advisory interoperability” stream in app runtime.
- More robust source drift/error handling and surfacing for scraper-type sources.
- Stronger district-level operational panels matching MVP examples.

---

## 5. Functionality Issues To Fix

### 5.1 CAP editor value mismatch bug risk

In the composer, schema validation expects capitalized urgency/certainty enum values and strict severity enum values, but select options currently submit lowercase values and include extra values. This can cause save errors.

File:
- [app/[locale]/dashboard/alerts/[id]/page.tsx](app/[locale]/dashboard/alerts/[id]/page.tsx)

### 5.2 Middleware session handling gap

Middleware imports updateSession but does not call it. This may cause auth/session edge-case behavior.

File:
- [proxy.ts](proxy.ts)

### 5.3 IRSA ingestion persistence quality

IRSA route parses PDF content but does not currently persist clean structured reservoir metrics into a dedicated operational model.

File:
- [app/api/ingest/irsa/route.ts](app/api/ingest/irsa/route.ts)

### 5.4 PMD ingestion is snapshot-only

PMD route currently stores snapshots and indicates parsing is pending. This should be upgraded to normalized data extraction.

File:
- [app/api/ingest/pmd-snapshot/route.ts](app/api/ingest/pmd-snapshot/route.ts)

### 5.5 Cron coverage is too limited

Only one cron is configured in deployment config. More ingestion/simulation/health tasks should be scheduled explicitly.

File:
- [vercel.json](vercel.json)

---

## 6. Schema and Data-Model Risks

### 6.1 Schema snapshot drift

Current schema dump does not represent current app behavior and migrations cleanly.

Files:
- [supabase/schema.sql](supabase/schema.sql)
- [supabase/migrations/20260718_day5_dissemination_ack.sql](supabase/migrations/20260718_day5_dissemination_ack.sql)

### 6.2 Legacy model overlap

Legacy alert model and active alert_candidate-centric flow both exist conceptually, increasing confusion unless explicitly reconciled.

### 6.3 Trigger and policy verification needed

Audit append-only enforcement and status-change auditing need explicit verification that triggers are attached in the actual database state, not only declared in SQL artifacts.

### 6.4 Migration hygiene

Review migration history for duplicates/empty migration artifacts and unify as authoritative linear history.

---

## 7. Security and Ops Hygiene To Improve

- Remove hardcoded DB credentials from scripts and move all script DB access to environment variables.
- Ensure service-role usage is restricted to server-side internal routes only.
- Add health/error telemetry around ingestion failure paths.
- Add consistent secret handling for pdf/report generation and external fetch adapters.

Files to inspect:
- [scripts](scripts)
- [lib/supabase/admin.ts](lib/supabase/admin.ts)

---

## 8. Suggested Next Implementation Order

1. Fix CAP composer enum mismatches and workflow guardrails.
2. Align schema + migrations with actual runtime model; regenerate authoritative schema dump.
3. Upgrade PMD and IRSA from partial parsing to normalized ingestion.
4. Promote NDMA/PDMA and CHIRPS from scripts to integrated app routes + cron + ingest_status.
5. Add Google Flood adapter and district/gauge views.
6. Add GloFAS WMS-T overlay (fast win) and optional EWDS ingestion.
7. Implement replay mode module and at least one scripted scenario.
8. Expand localization coverage across dashboard/operator text.
9. Harden middleware/session behavior and role checks.
10. Expand cron schedule and operational monitoring.

---

## 9. Key Files Claude Should Read First

- [package.json](package.json)
- [app/[locale]/dashboard/page.tsx](app/[locale]/dashboard/page.tsx)
- [app/[locale]/dashboard/DashboardMap.tsx](app/[locale]/dashboard/DashboardMap.tsx)
- [app/[locale]/dashboard/stations/page.tsx](app/[locale]/dashboard/stations/page.tsx)
- [app/[locale]/dashboard/alerts/page.tsx](app/[locale]/dashboard/alerts/page.tsx)
- [app/[locale]/dashboard/alerts/[id]/page.tsx](app/[locale]/dashboard/alerts/[id]/page.tsx)
- [app/[locale]/dashboard/alerts/[id]/dissemination/page.tsx](app/[locale]/dashboard/alerts/[id]/dissemination/page.tsx)
- [app/[locale]/dashboard/district/[id]/page.tsx](app/[locale]/dashboard/district/[id]/page.tsx)
- [app/api/ingest/usgs/route.ts](app/api/ingest/usgs/route.ts)
- [app/api/ingest/flood-open-meteo/route.ts](app/api/ingest/flood-open-meteo/route.ts)
- [app/api/ingest/pmd-snapshot/route.ts](app/api/ingest/pmd-snapshot/route.ts)
- [app/api/ingest/irsa/route.ts](app/api/ingest/irsa/route.ts)
- [app/api/simulate/stations/route.ts](app/api/simulate/stations/route.ts)
- [app/api/report/generate/route.ts](app/api/report/generate/route.ts)
- [proxy.ts](proxy.ts)
- [vercel.json](vercel.json)
- [supabase/schema.sql](supabase/schema.sql)
- [supabase/migrations/20260718_day5_dissemination_ack.sql](supabase/migrations/20260718_day5_dissemination_ack.sql)

---

## 10. Final Summary

The project already contains a meaningful and demo-capable EWS workflow. The remaining challenge is not starting from zero; it is finishing the missing MVP integrations, tightening data-model correctness, and improving operational robustness.

Claude should preserve the existing flow, fix the high-risk mismatches first, then complete the missing source matrix and replay/reporting polish.
