-- =============================================
-- 011: Remove unused columns from gym_config
-- color_primario, color_secundario, monto_mensual, monto_inscripcion
-- monto_mensual/monto_inscripcion now live in gym_config_metodos_pago
-- =============================================

ALTER TABLE gym_config DROP COLUMN IF EXISTS color_primario;
ALTER TABLE gym_config DROP COLUMN IF EXISTS color_secundario;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_mensual;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_inscripcion;
