-- 030: Suspension de pagos por solicitud del miembro
-- Estados: suspendido_pendiente (miembro solicita), suspendido (admin aprueba)

-- 1. Agregar nuevos estados al CHECK constraint
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_estado_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_estado_check
  CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'suspendido_pendiente', 'suspendido'));

-- 2. Campo de auditoría: quién creó el registro
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);

-- 3. Index para filtrar suspensiones pendientes
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);
