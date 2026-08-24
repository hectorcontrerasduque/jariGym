-- 031: Allow deleting suspendido_pendiente pagos (same rules as pendiente)

DROP POLICY IF EXISTS "Members can delete own pending pagos" ON pagos;
DROP POLICY IF EXISTS "Admins can delete pending pagos" ON pagos;

CREATE POLICY "Members can delete own pending pagos"
  ON pagos FOR DELETE
  USING (auth.uid() = usuario_id AND estado IN ('pendiente', 'suspendido_pendiente'));

CREATE POLICY "Admins can delete pending pagos"
  ON pagos FOR DELETE
  USING (get_user_role() IN ('super_admin', 'admin') AND estado IN ('pendiente', 'suspendido_pendiente'));
