-- 028: Agregar tipo_pago a tabla pagos
-- Valores: 'membresia' (mensualidad) o 'inscripcion'

ALTER TABLE pagos ADD COLUMN tipo_pago text NOT NULL DEFAULT 'membresia'
  CHECK (tipo_pago IN ('membresia', 'inscripcion'));

-- Migrar datos existentes: si las notas contienen 'inscripción' → tipo_pago = 'inscripcion'
UPDATE pagos SET tipo_pago = 'inscripcion'
  WHERE LOWER(notas) LIKE '%inscripción%' OR LOWER(notas) LIKE '%inscripcion%';
