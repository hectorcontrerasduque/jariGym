-- Restore public read access to gym_config
-- nombre_gym and logo_url are public gym info, not sensitive owner data
DROP POLICY IF EXISTS "Admins can read gym config" ON gym_config;

CREATE POLICY "Anyone can read gym config"
  ON gym_config FOR SELECT
  USING (true);
