-- Migration 021: Fix RLS self-update privilege escalation
-- The "Users can update own profile" policy allowed any user to set role = 'super_admin'
-- on their own row. This migration restricts self-updates to non-sensitive fields only.

-- Drop the dangerous self-update policy
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Recreate with WITH CHECK that prevents role escalation
-- Users can still update their own profile (name, email, whatsapp, etc.)
-- but CANNOT change their role through this policy
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );
