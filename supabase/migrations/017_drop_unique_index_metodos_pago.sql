-- Drop unique index on metodo_pago to allow historical rows (soft-delete pattern)
-- The update strategy creates a new row and disables the old one,
-- so we need to allow multiple rows per method (only one habilitado=true at a time)
DROP INDEX IF EXISTS idx_metodos_pago_nombre;

-- Partial unique index: only one active row per method
CREATE UNIQUE INDEX idx_metodos_pago_active ON gym_config_metodos_pago(metodo_pago) WHERE habilitado = true;
