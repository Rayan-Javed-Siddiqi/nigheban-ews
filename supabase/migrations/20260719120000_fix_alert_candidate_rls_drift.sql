-- Fix RLS drift on alert_candidate.
--
-- Root cause: migration 20260719000000_strict_rls_alert_candidate.sql was
-- written to lock this table down, but pg_policies confirms it was never
-- actually applied — the original permissive policies are still live:
--   - "Allow public read access"        SELECT  public         USING (true)
--   - "Allow authenticated update access" UPDATE authenticated USING (true) WITH CHECK (true)
--   - "Allow service role full access"  ALL     service_role   USING (true) WITH CHECK (true)
-- A companion file (20260719103131_strict_rls_alert_candidate.sql) with the
-- same base name and a later timestamp was found empty — almost certainly a
-- placeholder left behind when the original attempt was re-run by hand in
-- the Supabase dashboard and never actually captured in a migration file.
--
-- This migration is self-contained and idempotent: it drops whatever is
-- currently live under any of the known policy names (old or previously
-- intended) and re-creates the correct, narrower set from scratch. Do not
-- assume the previous migration ran — that assumption is what caused this.

-- Step 1: RLS must be enabled (defensive — should already be true)
ALTER TABLE alert_candidate ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop every policy we know might exist under any prior attempt,
-- by any of their names, so this migration is safe to re-run.
DROP POLICY IF EXISTS "Allow public read access" ON alert_candidate;
DROP POLICY IF EXISTS "Allow authenticated update access" ON alert_candidate;
DROP POLICY IF EXISTS "Allow service role full access" ON alert_candidate;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON alert_candidate;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON alert_candidate;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON alert_candidate;
DROP POLICY IF EXISTS "Allow insert for duty officers only" ON alert_candidate;
DROP POLICY IF EXISTS "Allow update for specific roles" ON alert_candidate;

-- Step 3: SELECT — staff only. The MVP build guide specifies "RLS
-- default-deny; roles: dg, duty_officer, district_focal" with no anon/
-- public role in the architecture — this is an internal operator console,
-- not a citizen-facing app. Public dissemination happens through the
-- alert_delivery / channel_recipient_count tables (SMS, WhatsApp, sirens,
-- etc.), never by exposing this table to unauthenticated reads. If a
-- citizen-facing view is added later, it should be a dedicated public view
-- restricted to issued alerts, not a policy on this table.
CREATE POLICY "alert_candidate_select_staff"
ON alert_candidate FOR SELECT
TO authenticated
USING (true);

-- Step 4: INSERT — only duty_officer may create new alert candidates.
CREATE POLICY "alert_candidate_insert_duty_officer"
ON alert_candidate FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = auth.uid()
    AND profile.role = 'duty_officer'
  )
);

-- Step 5: UPDATE — duty_officer may edit only while the alert is still in
-- draft/pending_approval; dg may update any alert at any status (approve,
-- dismiss, or override). This is the actual role gate that was missing —
-- previously ANY authenticated user could update ANY row via
-- "Allow authenticated update access" (USING true / WITH CHECK true).
CREATE POLICY "alert_candidate_update_role_gated"
ON alert_candidate FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = auth.uid()
    AND profile.role IN ('duty_officer', 'dg')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = auth.uid()
    AND (
      profile.role = 'dg'
      OR (profile.role = 'duty_officer' AND status IN ('draft', 'pending_approval'))
    )
  )
);

-- Step 6: service_role keeps full bypass access, as it must for the alert
-- engine's triggers (INSERT INTO alert_candidate ... from server-side
-- rule-evaluation functions) and the cron-driven jobs.
CREATE POLICY "alert_candidate_service_role_full_access"
ON alert_candidate FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
