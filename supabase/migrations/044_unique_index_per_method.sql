-- 044: Cambia unique index de global a por tipo de pago
-- Antes: solo 1 fila activa en toda la tabla
-- Ahora: 1 fila activa por payment_method (versionado temporal)

DROP INDEX IF EXISTS idx_one_active_payment_method;

CREATE UNIQUE INDEX idx_one_active_per_method
  ON gym_config_payment_methods (payment_method) WHERE is_active = true;
