-- 064: Método de pago por defecto que aparece preseleccionado en Mis Pagos.
-- NULL = derivar automáticamente: el método activo con la primera activación
-- más antigua (ver lib/features/pagos/domain/metodos.ts).
ALTER TABLE gym_config
  ADD COLUMN IF NOT EXISTS default_payment_method text;

ALTER TABLE gym_config
  DROP CONSTRAINT IF EXISTS gym_config_default_payment_method_check;

ALTER TABLE gym_config
  ADD CONSTRAINT gym_config_default_payment_method_check
  CHECK (default_payment_method IS NULL OR default_payment_method IN ('efectivo', 'bs', 'binance'));

COMMENT ON COLUMN gym_config.default_payment_method IS
  'Método de pago preseleccionado en Mis Pagos. NULL = el método activo con la primera activación más antigua.';

-- Defensivo: la 042 creó un índice único global (solo 1 método activo en total)
-- que la 044 reemplazó por uno por tipo. Si en algún entorno quedó el global,
-- el guardado de Config no puede activar varios métodos a la vez.
DROP INDEX IF EXISTS idx_one_active_payment_method;
