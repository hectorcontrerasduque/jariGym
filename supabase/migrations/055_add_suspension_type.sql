-- 057: Agregar payment_type='suspension' + CHECK monto > 0

-- 1. Eliminar constraint viejo de payment_type
ALTER TABLE payment_detail
  DROP CONSTRAINT IF EXISTS payment_detail_payment_type_check;

-- 2. Agregar constraint nuevo con 'suspension'
ALTER TABLE payment_detail
  ADD CONSTRAINT payment_detail_payment_type_check
  CHECK (payment_type IN ('mensualidad', 'inscripcion', 'suspension'));

-- 3. Actualizar registros existentes con monto 0 a tipo 'suspension'
UPDATE payment_detail
SET payment_type = 'suspension'
WHERE payment_amount <= 0
  AND payment_type IN ('mensualidad', 'inscripcion');

-- 4. CHECK: monto > 0 para mensualidad e inscripcion (suspension puede ser 0)
ALTER TABLE payment_detail
  ADD CONSTRAINT check_pago_monto_positivo
  CHECK (
    payment_type = 'suspension'
    OR payment_amount > 0
  );

-- 5. Corregir registros de migración: status suspendido → aprobado, type mensualidad → suspension, amount → 0
WITH upd_payments AS (
  UPDATE payments p SET status = 'aprobado', approved_at = now()
  FROM payment_detail pd
  WHERE pd.payment_id = p.id
    AND p.payment_note = 'Registro por migración de data'
    AND p.status = 'suspendido'
    AND pd.payment_type = 'mensualidad'
    AND pd.payment_amount > 0
  RETURNING pd.id AS detalle_id
)
UPDATE payment_detail
SET payment_type = 'suspension', payment_amount = 0
WHERE id IN (SELECT detalle_id FROM upd_payments);
