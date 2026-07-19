-- Step 1: Ensure RLS is enabled
ALTER TABLE alert_candidate ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow select for authenticated users" ON alert_candidate;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON alert_candidate;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON alert_candidate;

-- Step 3: Global read access for authenticated users
CREATE POLICY "Allow select for authenticated users" 
ON alert_candidate FOR SELECT 
TO authenticated 
USING (true);

-- Step 4: INSERT Policy
-- ONLY 'duty_officer' can insert new alert candidates
CREATE POLICY "Allow insert for duty officers only" 
ON alert_candidate FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profile 
    WHERE profile.id = auth.uid() 
    AND profile.role = 'duty_officer'
  )
);

-- Step 5: UPDATE Policy
-- 'duty_officer' can update their own drafts or pending
-- 'dg' can update ANY alert to approve or dismiss
CREATE POLICY "Allow update for specific roles" 
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
      profile.role = 'dg' OR 
      (profile.role = 'duty_officer' AND status IN ('draft', 'pending_approval'))
    )
  )
);
