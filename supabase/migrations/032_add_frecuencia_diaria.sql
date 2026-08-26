-- 032: Agregar frecuencia diaria a notificacion_config
ALTER TABLE notificacion_config
  ADD COLUMN IF NOT EXISTS frecuencia_diaria boolean DEFAULT false;
