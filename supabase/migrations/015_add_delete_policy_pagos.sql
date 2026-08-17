-- 015_add_delete_policy_pagos.sql
-- Allow members to delete their own pending pagos
-- Allow admins to delete any pending pago

CREATE POLICY "Members can delete own pending pagos"
  ON pagos FOR DELETE
  USING (auth.uid() = usuario_id AND estado = 'pendiente');

CREATE POLICY "Admins can delete pending pagos"
  ON pagos FOR DELETE
  USING (get_user_role() IN ('super_admin', 'admin') AND estado = 'pendiente');
