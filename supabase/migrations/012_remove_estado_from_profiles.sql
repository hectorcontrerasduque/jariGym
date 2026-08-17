-- =============================================
-- 012: Remove estado and notas_estado from profiles
-- Estado is tracked via member_states audit table
-- =============================================

DROP INDEX IF EXISTS idx_profiles_estado;

ALTER TABLE profiles DROP COLUMN IF EXISTS estado;
ALTER TABLE profiles DROP COLUMN IF EXISTS notas_estado;
