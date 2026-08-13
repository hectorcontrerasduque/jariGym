-- =============================================
-- MIGRATION 004: CPANEL OVERHAUL
-- =============================================

-- 1. Add inscription fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inscripcion_pagada boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inscripcion_fecha timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notas_admin text;

-- 2. Add bill codes to pagos (last 5 alphanumeric chars of bill/dollar)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS codigo_billete text;

-- 3. Add membresia_libre to profiles (admin sets this per member)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS membresia_libre boolean DEFAULT false;

-- 4. Add notas_cancelacion for suspend/inactivate
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notas_estado text;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_inscripcion ON profiles(inscripcion_pagada);
CREATE INDEX IF NOT EXISTS idx_profiles_membresia_libre ON profiles(membresia_libre);
CREATE INDEX IF NOT EXISTS idx_pagos_codigo_billete ON pagos(codigo_billete);

-- 6. Ensure cash is accepted by default in gym_config
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS acepta_efectivo boolean DEFAULT true;
UPDATE gym_config SET acepta_efectivo = true WHERE acepta_efectivo IS NULL;

