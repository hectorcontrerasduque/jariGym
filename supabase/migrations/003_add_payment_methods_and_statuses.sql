-- =============================================
-- MIGRATION 003: Payment methods, member statuses, configurable amounts
-- =============================================

-- 1. Add payment method to pagos
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT 'efectivo' 
  CHECK (metodo_pago IN ('efectivo', 'bs', 'binance', 'transferencia', 'membresia_libre'));

-- 2. Add monto_configurado to gym_config (amount the gym charges)
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS monto_mensual decimal(10,2) DEFAULT 29.99;
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS monto_inscripcion decimal(10,2) DEFAULT 0;
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS acepta_bs boolean DEFAULT false;
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS acepta_binance boolean DEFAULT false;
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS acepta_transferencia boolean DEFAULT false;

-- 3. Add member status (activo, suspendido, inactivo)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS estado text DEFAULT 'activo' 
  CHECK (estado IN ('activo', 'suspendido', 'inactivo'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fecha_inscripcion timestamptz DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monto_inscripcion_pagado decimal(10,2) DEFAULT 0;

-- 4. Add aprobado_por to pagos (who approved and when)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS fecha_pago_real timestamptz;

-- 5. Create index for new fields
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON profiles(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_metodo ON pagos(metodo_pago);

-- 6. Insert default gym_config for gym-elite if not exists
INSERT INTO gym_config (tenant_id, monto_mensual, monto_inscripcion, acepta_bs, acepta_binance, acepta_transferencia)
SELECT t.id, 29.99, 0, false, false, false
FROM tenants t
WHERE t.slug = 'gym-elite'
AND NOT EXISTS (SELECT 1 FROM gym_config WHERE tenant_id = t.id);
