-- =============================================
-- 029: Sistema de Notificaciones Automáticas
-- =============================================

-- 1. Switch maestro en gym_config
ALTER TABLE gym_config
  ADD COLUMN IF NOT EXISTS notificaciones_enabled boolean DEFAULT false;

-- 2. Tabla notificacion_config (reemplaza notificaciones_config)
CREATE TABLE IF NOT EXISTS notificacion_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_notificacion text NOT NULL
    CHECK (tipo_notificacion IN (
      'miembros_deudores',
      'recordatorio_pago',
      'resumen_dueno',
      'estatus_sistema'
    )),
  habilitado boolean DEFAULT true,
  frecuencia_semanal boolean DEFAULT false,
  frecuencia_quincenal boolean DEFAULT false,
  frecuencia_mensual boolean DEFAULT true,
  dias_previo int DEFAULT 3,
  notificar_por_email boolean DEFAULT true,
  notificar_por_whatsapp boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notificacion_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access notificacion_config"
  ON notificacion_config FOR ALL
  USING (get_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Members can read notificacion_config"
  ON notificacion_config FOR SELECT
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_config_tipo ON notificacion_config(tipo_notificacion);

-- 3. Tabla notificacion_log (reemplaza notificaciones_log)
DROP TABLE IF EXISTS notificacion_log CASCADE;

CREATE TABLE notificacion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_notificacion_config uuid NOT NULL
    REFERENCES notificacion_config(id) ON DELETE CASCADE,
  miembros_notificados int DEFAULT 0,
  fecha_hora_envio timestamptz DEFAULT now(),
  sin_problemas boolean DEFAULT true,
  error_detalle text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notificacion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view notificacion_log"
  ON notificacion_log FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

CREATE INDEX IF NOT EXISTS idx_notif_log_config ON notificacion_log(id_notificacion_config);
CREATE INDEX IF NOT EXISTS idx_notif_log_fecha ON notificacion_log(fecha_hora_envio);

-- 4. Insertar configs por defecto (todas deshabilitadas)
INSERT INTO notificacion_config (tipo_notificacion, habilitado, frecuencia_mensual, dias_previo)
VALUES
  ('miembros_deudores', false, true, 3),
  ('recordatorio_pago', false, true, 3),
  ('resumen_dueno', false, true, 3),
  ('estatus_sistema', false, false, 3)
ON CONFLICT (tipo_notificacion) DO NOTHING;

-- 5. Eliminar tablas viejas
DROP TABLE IF EXISTS notificaciones_config CASCADE;
DROP TABLE IF EXISTS notificaciones_log CASCADE;
