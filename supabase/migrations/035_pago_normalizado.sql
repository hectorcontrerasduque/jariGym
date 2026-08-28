-- Migration 035: Pago normalizado - pagos (cabecera) + detalle_pago (detalle por mes)
-- Strategy: Rename pagos → pagos_historial, create new pagos + detalle_pago, migrate data

-- =============================================
-- 1. RENAME old table
-- =============================================
ALTER TABLE IF EXISTS pagos RENAME TO pagos_historial;

-- =============================================
-- 2. Create new pagos (cabecera)
-- =============================================
CREATE TABLE pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'suspendido')),
  metodo_pago text NOT NULL DEFAULT 'efectivo',
  codigo_billete text,
  comprobante_url text,
  notas text,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pagos_usuario ON pagos(usuario_id);
CREATE INDEX idx_pagos_estado ON pagos(estado);

-- =============================================
-- 3. Create detalle_pago (detalle por mes/inscripcion)
-- =============================================
CREATE TABLE detalle_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id uuid NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  mes int CHECK (mes BETWEEN 1 AND 12),
  anio int CHECK (anio BETWEEN 2020 AND 2099),
  tipo_pago text NOT NULL DEFAULT 'mensualidad' CHECK (tipo_pago IN ('mensualidad', 'inscripcion')),
  monto numeric(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_detalle_pago_pago ON detalle_pago(pago_id);
CREATE INDEX idx_detalle_pago_usuario_mes ON detalle_pago(pago_id, mes, anio);

-- =============================================
-- 4. Migrate data from pagos_historial
-- =============================================

-- 4a. Create pagos records (grouped by usuario_id + estado + metodo_pago + notas + created_by)
INSERT INTO pagos (id, usuario_id, estado, metodo_pago, codigo_billete, comprobante_url, notas, approved_by, approved_at, created_by, created_at, updated_at)
SELECT
  gen_random_uuid(),
  h.usuario_id,
  h.estado,
  COALESCE(h.metodo_pago, 'efectivo'),
  h.codigo_billete,
  h.comprobante_url,
  h.notas,
  h.approved_by,
  h.approved_at,
  h.created_by,
  MIN(h.created_at),
  MAX(h.updated_at)
FROM pagos_historial h
GROUP BY h.usuario_id, h.estado, h.metodo_pago, h.codigo_billete, h.comprobante_url, h.notas, h.approved_by, h.approved_at, h.created_by;

-- 4b. Create detalle_pago records (one per old pagos row)
INSERT INTO detalle_pago (id, pago_id, mes, anio, tipo_pago, monto)
SELECT
  gen_random_uuid(),
  p.id,
  h.mes_pagar,
  h.anio_pagar,
  COALESCE(h.tipo_pago, 'mensualidad'),
  h.monto
FROM pagos_historial h
JOIN pagos p ON
  p.usuario_id = h.usuario_id
  AND p.estado = h.estado
  AND p.metodo_pago = COALESCE(h.metodo_pago, 'efectivo')
  AND p.notas IS NOT DISTINCT FROM h.notas
  AND p.created_by IS NOT DISTINCT FROM h.created_by
  AND DATE(p.created_at) = DATE(h.created_at)
ORDER BY h.created_at;

-- =============================================
-- 5. RLS policies
-- =============================================

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_pago ENABLE ROW LEVEL SECURITY;

-- pagos: members can view own
CREATE POLICY "Members can view own pagos" ON pagos
  FOR SELECT USING (auth.uid() = usuario_id);

-- pagos: admins can view all
CREATE POLICY "Admins can view all pagos" ON pagos
  FOR SELECT USING (get_user_role() IN ('super_admin', 'admin'));

-- pagos: members can insert own
CREATE POLICY "Members can insert own pagos" ON pagos
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- pagos: admins can insert for anyone
CREATE POLICY "Admins can insert pagos for any user" ON pagos
  FOR INSERT WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- pagos: admins can update
CREATE POLICY "Admins can update pagos" ON pagos
  FOR UPDATE USING (get_user_role() IN ('super_admin', 'admin'));

-- pagos: admins can delete
CREATE POLICY "Admins can delete pagos" ON pagos
  FOR DELETE USING (get_user_role() IN ('super_admin', 'admin'));

-- detalle_pago: members can view own via pago parent
CREATE POLICY "Members can view own detalle" ON detalle_pago
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pagos WHERE pagos.id = detalle_pago.pago_id AND pagos.usuario_id = auth.uid())
  );

-- detalle_pago: admins can view all
CREATE POLICY "Admins can view all detalle" ON detalle_pago
  FOR SELECT USING (get_user_role() IN ('super_admin', 'admin'));

-- detalle_pago: members can insert own via pago parent
CREATE POLICY "Members can insert own detalle" ON detalle_pago
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM pagos WHERE pagos.id = detalle_pago.pago_id AND pagos.usuario_id = auth.uid())
  );

-- detalle_pago: admins can insert for anyone
CREATE POLICY "Admins can insert detalle for any user" ON detalle_pago
  FOR INSERT WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- detalle_pago: admins can update
CREATE POLICY "Admins can update detalle" ON detalle_pago
  FOR UPDATE USING (get_user_role() IN ('super_admin', 'admin'));

-- detalle_pago: admins can delete
CREATE POLICY "Admins can delete detalle" ON detalle_pago
  FOR DELETE USING (get_user_role() IN ('super_admin', 'admin'));

-- =============================================
-- 6. Storage policy for comprobantes (admin upload)
-- =============================================
DROP POLICY IF EXISTS "Comprobante upload" ON storage.objects;
CREATE POLICY "Comprobante upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR get_user_role() IN ('super_admin', 'admin')
    )
  );
