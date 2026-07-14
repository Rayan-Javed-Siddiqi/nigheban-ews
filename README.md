\# Nigheban — Multi-Hazard Early Warning Platform



Provincial multi-hazard monitoring and alert console for Khyber Pakhtunkhwa (KP) and Gilgit-Baltistan (GB), Pakistan. Built for Finova Solutions.



\## Status: Day 1 of 6 — Foundations



\- ✅ Supabase project (PostGIS + RLS default-deny + 4 roles)

\- ✅ 49 real KP/GB district boundaries loaded (OCHA HDX COD-AB)

\- ✅ Authentication working (Supabase Auth)

\- ✅ Dashboard shell with live MapLibre map + KPI strip

\- ✅ Live USGS earthquake feed (auto-refreshing hazard layer)



\## Stack



\- Next.js 16 (App Router, Turbopack)

\- Supabase (Postgres + PostGIS + Auth + RLS)

\- MapLibre GL JS

\- Tailwind CSS v4



\## Local setup



1\. Clone the repo

2\. `npm install`

3\. Copy `.env.example` to `.env.local` and fill in your Supabase project values

4\. `npm run dev`

5\. Visit `http://localhost:3000`



\## Branch model



`feature/\* → staging → main`. See project handbook for full workflow.



\## Roles



`dg`, `duty\_officer`, `district\_focal`, `viewer` — enforced via Postgres RLS policies, not just app-level checks.

