-- =============================================
-- 049: Renombrar tablas y columnas de notificaciones a inglés
-- =============================================
-- Descripción:
--   Renombra las tablas notificacion_config → notification_config y
--   notificacion_log → notification_log.
--   Renombra todas las columnas de español a inglés para consistencia
--   con el resto del esquema.
--   Agrega campos de auditoría (created_by, updated_by) a ambas tablas.
--   Agrega descripciones (COMMENT) a tablas y columnas.
--   Recrea políticas RLS e índices con los nuevos nombres.
--   Incluye patch para migration 032 (frecuencia_diaria) por si no se ejecutó.
--
-- Orden de columnas resultante:
--   notification_config: id, notification_type, is_active, daily_frequency,
--     weekly_frequency, biweekly_frequency, monthly_frequency, days_before,
--     notify_by_email, notify_by_whatsapp, created_at, updated_at,
--     created_by, updated_by
--   notification_log: id, notification_config_id, members_notified, sent_at,
--     no_issues, error_detail, created_at, updated_at, created_by, updated_by
-- =============================================

-- ─── PATCH: Asegurar que exista frecuencia_diaria (migration 032) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notificacion_config' AND column_name = 'frecuencia_diaria'
  ) THEN
    ALTER TABLE notificacion_config ADD COLUMN frecuencia_diaria boolean DEFAULT false;
  END IF;
END $$;

-- ─── RENOMBRAR TABLAS ─────────────────────────

ALTER TABLE notificacion_config RENAME TO notification_config;
ALTER TABLE notificacion_log RENAME TO notification_log;

-- ─── TABLA: notification_config ───────────────

-- Descripción de la tabla
COMMENT ON TABLE notification_config IS
  'Configuración de notificaciones automáticas por tipo. Cada fila define un tipo de notificación '
  '(miembros_deudores, recordatorio_pago, resumen_dueno, estatus_sistema) con su frecuencia '
  'y canales de envío habilitados.';

-- Renombrar columnas (solo si existen los nombres viejos)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'tipo_notificacion') THEN
    ALTER TABLE notification_config RENAME COLUMN tipo_notificacion TO notification_type;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'habilitado') THEN
    ALTER TABLE notification_config RENAME COLUMN habilitado TO is_active;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'frecuencia_diaria') THEN
    ALTER TABLE notification_config RENAME COLUMN frecuencia_diaria TO daily_frequency;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'frecuencia_semanal') THEN
    ALTER TABLE notification_config RENAME COLUMN frecuencia_semanal TO weekly_frequency;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'frecuencia_quincenal') THEN
    ALTER TABLE notification_config RENAME COLUMN frecuencia_quincenal TO biweekly_frequency;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'frecuencia_mensual') THEN
    ALTER TABLE notification_config RENAME COLUMN frecuencia_mensual TO monthly_frequency;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'dias_previo') THEN
    ALTER TABLE notification_config RENAME COLUMN dias_previo TO days_before;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'notificar_por_email') THEN
    ALTER TABLE notification_config RENAME COLUMN notificar_por_email TO notify_by_email;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'notificar_por_whatsapp') THEN
    ALTER TABLE notification_config RENAME COLUMN notificar_por_whatsapp TO notify_by_whatsapp;
  END IF;
END $$;

-- Agregar campos de auditoría (solo si no existen)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'created_by') THEN
    ALTER TABLE notification_config ADD COLUMN created_by uuid REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_config' AND column_name = 'updated_by') THEN
    ALTER TABLE notification_config ADD COLUMN updated_by uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Descripciones de columnas
COMMENT ON COLUMN notification_config.id IS
  'Identificador único de la configuración de notificación (UUID).';
COMMENT ON COLUMN notification_config.notification_type IS
  'Tipo de notificación. Valores válidos: miembros_deudores, recordatorio_pago, resumen_dueno, estatus_sistema.';
COMMENT ON COLUMN notification_config.is_active IS
  'Indica si esta notificación está habilitada (true) o deshabilitada (false).';
COMMENT ON COLUMN notification_config.daily_frequency IS
  'Enviar notificación todos los días.';
COMMENT ON COLUMN notification_config.weekly_frequency IS
  'Enviar notificación una vez por semana.';
COMMENT ON COLUMN notification_config.biweekly_frequency IS
  'Enviar notificación quincenalmente (cada 15 días).';
COMMENT ON COLUMN notification_config.monthly_frequency IS
  'Enviar notificación una vez al mes.';
COMMENT ON COLUMN notification_config.days_before IS
  'Días de anticipación antes del evento para enviar el recordatorio. Solo aplica para recordatorio_pago.';
COMMENT ON COLUMN notification_config.notify_by_email IS
  'Enviar notificación por correo electrónico.';
COMMENT ON COLUMN notification_config.notify_by_whatsapp IS
  'Enviar notificación por WhatsApp (próximamente).';
COMMENT ON COLUMN notification_config.created_at IS
  'Fecha y hora de creación del registro (autogenerada).';
COMMENT ON COLUMN notification_config.updated_at IS
  'Fecha y hora de última actualización del registro (autogenerada).';
COMMENT ON COLUMN notification_config.created_by IS
  'UUID del usuario que creó este registro (FK → profiles.id). Puede ser NULL si fue creado por cron.';
COMMENT ON COLUMN notification_config.updated_by IS
  'UUID del usuario que modificó por última vez este registro (FK → profiles.id).';

-- Recrear índice unique (el original usa el nombre de columna viejo)
DROP INDEX IF EXISTS idx_notif_config_tipo;
CREATE UNIQUE INDEX idx_notif_config_tipo ON notification_config(notification_type);

-- ─── POLICIES RLS: notification_config ────────

-- Eliminar políticas viejas (incluye la de migration 029 que nunca se dropeó)
DROP POLICY IF EXISTS "Admins full access notificacion_config" ON notification_config;
DROP POLICY IF EXISTS "Super admins full access notificacion_config" ON notification_config;
DROP POLICY IF EXISTS "Members can read notificacion_config" ON notification_config;

-- Recrear con nuevos nombres
CREATE POLICY "Super admins full access notification_config"
  ON notification_config FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Members can read notification_config"
  ON notification_config FOR SELECT
  USING (true);

-- ─── TABLA: notification_log ──────────────────

-- Descripción de la tabla
COMMENT ON TABLE notification_log IS
  'Registro histórico de cada ejecución de notificaciones. Almacena el resultado '
  '(éxito o error) y la cantidad de miembros notificados por cada ejecución.';

-- Renombrar columnas (solo si existen los nombres viejos)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'id_notificacion_config') THEN
    ALTER TABLE notification_log RENAME COLUMN id_notificacion_config TO notification_config_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'miembros_notificados') THEN
    ALTER TABLE notification_log RENAME COLUMN miembros_notificados TO members_notified;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'fecha_hora_envio') THEN
    ALTER TABLE notification_log RENAME COLUMN fecha_hora_envio TO sent_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'sin_problemas') THEN
    ALTER TABLE notification_log RENAME COLUMN sin_problemas TO no_issues;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'error_detalle') THEN
    ALTER TABLE notification_log RENAME COLUMN error_detalle TO error_detail;
  END IF;
END $$;

-- Agregar campos de auditoría (solo si no existen)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'created_by') THEN
    ALTER TABLE notification_log ADD COLUMN created_by uuid REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_log' AND column_name = 'updated_by') THEN
    ALTER TABLE notification_log ADD COLUMN updated_by uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Descripciones de columnas
COMMENT ON COLUMN notification_log.id IS
  'Identificador único del registro de log (UUID).';
COMMENT ON COLUMN notification_log.notification_config_id IS
  'FK → notification_config.id. Configuración que originó esta ejecución de notificación.';
COMMENT ON COLUMN notification_log.members_notified IS
  'Cantidad de miembros notificados exitosamente en esta ejecución.';
COMMENT ON COLUMN notification_log.sent_at IS
  'Fecha y hora en que se envió la notificación (autogenerada).';
COMMENT ON COLUMN notification_log.no_issues IS
  'true si la notificación se envió sin errores; false si hubo problemas.';
COMMENT ON COLUMN notification_log.error_detail IS
  'Detalle del error si hubo problemas al enviar. NULL si no_issues = true.';
COMMENT ON COLUMN notification_log.created_at IS
  'Fecha y hora de creación del registro (autogenerada).';
COMMENT ON COLUMN notification_log.updated_at IS
  'Fecha y hora de última actualización del registro (autogenerada).';
COMMENT ON COLUMN notification_log.created_by IS
  'UUID del usuario que ejecutó esta notificación (FK → profiles.id). NULL si fue ejecutado por cron.';
COMMENT ON COLUMN notification_log.updated_by IS
  'UUID del usuario que modificó por última vez este registro (FK → profiles.id).';

-- Recrear índices (los originales usan nombres de columna viejos)
DROP INDEX IF EXISTS idx_notif_log_config;
DROP INDEX IF EXISTS idx_notif_log_fecha;
CREATE INDEX idx_notif_log_config ON notification_log(notification_config_id);
CREATE INDEX idx_notif_log_fecha ON notification_log(sent_at);

-- ─── POLICIES RLS: notification_log ───────────

-- Eliminar políticas viejas
DROP POLICY IF EXISTS "Admins can view notificacion_log" ON notification_log;
DROP POLICY IF EXISTS "Super admins can view notificacion_log" ON notification_log;

-- Recrear con nuevo nombre
CREATE POLICY "Super admins can view notification_log"
  ON notification_log FOR SELECT
  USING (get_user_role() = 'super_admin');
