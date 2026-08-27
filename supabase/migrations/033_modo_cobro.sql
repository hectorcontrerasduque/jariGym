-- 033: Modo de cobro - dia_uno o fecha_inscripcion
ALTER TABLE gym_config
  ADD COLUMN IF NOT EXISTS modo_cobro text DEFAULT 'dia_uno'
  CHECK (modo_cobro IN ('dia_uno', 'fecha_inscripcion'));
