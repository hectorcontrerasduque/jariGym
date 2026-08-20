-- 025: Add 'suspendido' to pagos estado + RLS for migracion table

-- 1. Add 'suspendido' to pagos CHECK constraint
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_estado_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_estado_check
  CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'suspendido'));

-- 2. RLS for migracion table (service_role only)
ALTER TABLE migracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage migracion" ON migracion;
CREATE POLICY "Service role can manage migracion"
  ON migracion FOR ALL
  USING (auth.role() = 'service_role');
