-- =============================================
-- 006: Add cedula and horario_entreno to profiles
-- =============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cedula text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS horario_entreno text;

CREATE INDEX IF NOT EXISTS idx_profiles_cedula ON profiles(cedula);
