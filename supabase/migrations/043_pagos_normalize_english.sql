-- ============================================================
-- 043_pagos_normalize_english.sql
-- Normaliza tablas pagos y detalle_pago a inglés
-- ============================================================

-- 1. Crear tabla payments (nueva)
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'suspendido')),
  payment_method text NOT NULL DEFAULT 'efectivo',
  bill_code text,
  receipt_url text,
  payment_note text,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- 2. Migrar datos de pagos → payments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pagos') THEN
    INSERT INTO payments (id, user_id, status, payment_method, bill_code, receipt_url,
      payment_note, approved_at, approved_by, created_at, created_by, updated_at)
    SELECT id, usuario_id, estado, metodo_pago, codigo_billete, comprobante_url,
      notas, approved_at, approved_by, created_at, created_by, updated_at
    FROM pagos;
  END IF;
END $$;

-- 3. Crear tabla payment_detail (nueva)
CREATE TABLE IF NOT EXISTS payment_detail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  month_number int CHECK (month_number BETWEEN 1 AND 12),
  year_number int CHECK (year_number BETWEEN 2020 AND 2099),
  payment_type text NOT NULL DEFAULT 'mensualidad'
    CHECK (payment_type IN ('mensualidad', 'inscripcion')),
  payment_amount numeric(10,2) NOT NULL DEFAULT 0
);

-- 4. Migrar datos de detalle_pago → payment_detail
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'detalle_pago') THEN
    INSERT INTO payment_detail (id, payment_id, month_number, year_number, payment_type, payment_amount)
    SELECT id, pago_id, mes, anio, tipo_pago, monto
    FROM detalle_pago;
  END IF;
END $$;

-- 5. Eliminar tablas viejas
DROP TABLE IF EXISTS detalle_pago CASCADE;
DROP TABLE IF EXISTS pagos CASCADE;

-- 6. Índices
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payment_detail_payment ON payment_detail(payment_id);
CREATE INDEX idx_payment_detail_month ON payment_detail(month_number, year_number);

-- 7. RLS policies - payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all payments" ON payments
  FOR SELECT USING (get_user_role() = 'super_admin');
CREATE POLICY "Members can insert own payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Super admins can insert payments for any user" ON payments
  FOR INSERT WITH CHECK (get_user_role() = 'super_admin');
CREATE POLICY "Super admins can update payments" ON payments
  FOR UPDATE USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');
CREATE POLICY "Super admins can delete payments" ON payments
  FOR DELETE USING (get_user_role() = 'super_admin');

-- 8. RLS policies - payment_detail
ALTER TABLE payment_detail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own detail" ON payment_detail
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_detail.payment_id AND payments.user_id = auth.uid())
  );
CREATE POLICY "Super admins can view all detail" ON payment_detail
  FOR SELECT USING (get_user_role() = 'super_admin');
CREATE POLICY "Members can insert own detail" ON payment_detail
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_detail.payment_id AND payments.user_id = auth.uid())
  );
CREATE POLICY "Super admins can insert detail for any user" ON payment_detail
  FOR INSERT WITH CHECK (get_user_role() = 'super_admin');
CREATE POLICY "Super admins can update detail" ON payment_detail
  FOR UPDATE USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');
CREATE POLICY "Super admins can delete detail" ON payment_detail
  FOR DELETE USING (get_user_role() = 'super_admin');

-- 9. Triggers
CREATE TRIGGER trigger_payments_updated
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION set_payments_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_payments_audit
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_payments_audit();

-- 10. Descripciones de tablas
COMMENT ON TABLE payments IS 'Registra las cabeceras de pago de los miembros. Cada pago agrupa uno o más detalles.';
COMMENT ON TABLE payment_detail IS 'Detalle de cada pago, con un registro por mes cobrado o por inscripción. Sin campos de auditoría.';

-- 11. Descripciones de columnas - payments
COMMENT ON COLUMN payments.id IS 'Identificador único del pago';
COMMENT ON COLUMN payments.user_id IS 'Referencia al miembro que realiza el pago';
COMMENT ON COLUMN payments.status IS 'Estado del pago: pendiente, aprobado, rechazado, suspendido';
COMMENT ON COLUMN payments.payment_method IS 'Método de pago: efectivo, bs, binance';
COMMENT ON COLUMN payments.bill_code IS 'Código del billete o referencia de efectivo';
COMMENT ON COLUMN payments.receipt_url IS 'URL del comprobante de pago en Storage';
COMMENT ON COLUMN payments.payment_note IS 'Notas o comentarios adicionales del pago';
COMMENT ON COLUMN payments.approved_at IS 'Fecha y hora de aprobación del pago';
COMMENT ON COLUMN payments.approved_by IS 'Referencia al admin que aprobó el pago';
COMMENT ON COLUMN payments.created_at IS 'Fecha de creación del registro';
COMMENT ON COLUMN payments.created_by IS 'Usuario que creó el registro';
COMMENT ON COLUMN payments.updated_at IS 'Fecha de última actualización';
COMMENT ON COLUMN payments.updated_by IS 'Usuario que modificó por última vez';

-- 12. Descripciones de columnas - payment_detail
COMMENT ON COLUMN payment_detail.id IS 'Identificador único del detalle';
COMMENT ON COLUMN payment_detail.payment_id IS 'Referencia a la cabecera de pago';
COMMENT ON COLUMN payment_detail.month_number IS 'Número del mes (1-12). Null si es inscripción';
COMMENT ON COLUMN payment_detail.year_number IS 'Año del cobro (2020-2099). Null si es inscripción';
COMMENT ON COLUMN payment_detail.payment_type IS 'Tipo: mensualidad o inscripción';
COMMENT ON COLUMN payment_detail.payment_amount IS 'Monto del pago en la moneda del gym';
