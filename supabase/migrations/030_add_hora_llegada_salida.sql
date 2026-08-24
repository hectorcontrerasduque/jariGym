-- 030: Add hora_llegada and hora_salida to profiles
-- hora_llegada: hora de llegada al gym (formato HH:MM, 24h)
-- hora_salida: hora de salida del gym (formato HH:MM, 24h)
-- Valores "--:--" indican que no se ha registrado horario

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hora_llegada text DEFAULT '--:--';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hora_salida text DEFAULT '--:--';
