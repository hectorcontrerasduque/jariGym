-- Migration 046: Allow all authenticated users to read gym_config + payment methods
-- The gym_name, logo, and payment info are needed for miembro views (Home tab, sidebar)
-- Note: This replaces the RLS from migration 042 which restricted reads to super_admin only

-- Drop the super_admin-only SELECT policy on gym_config
DROP POLICY IF EXISTS "Super admins can read gym config" ON gym_config;

-- Replace with a policy that allows any authenticated user to read
CREATE POLICY "Authenticated users can read gym config"
  ON gym_config FOR SELECT
  USING (auth.role() = 'authenticated');

-- Drop the super_admin-only ALL policy on gym_config_payment_methods
DROP POLICY IF EXISTS "Super admins can manage payment methods" ON gym_config_payment_methods;

-- Replace with: super_admin can manage, authenticated users can read
CREATE POLICY "Super admins can manage payment methods"
  ON gym_config_payment_methods FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Authenticated users can read payment methods"
  ON gym_config_payment_methods FOR SELECT
  USING (auth.role() = 'authenticated');
