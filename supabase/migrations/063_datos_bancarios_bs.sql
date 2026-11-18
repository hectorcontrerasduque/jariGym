-- Datos bancarios para pagos en Bolívares (pago móvil / transferencia).
-- Se guardan como JSON en gym_config para que el miembro pueda consultarlos.
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS bs_bank_info jsonb;
