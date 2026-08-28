-- Fix: Admin INSERT policy for pagos table
-- Without this, admins cannot report payments for other members
-- because RLS requires auth.uid() = usuario_id

-- 1. Admin can insert pagos for any user
DROP POLICY IF EXISTS "Admins can insert pagos for any user" ON pagos;
CREATE POLICY "Admins can insert pagos for any user"
  ON pagos FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- 2. Admin can upload comprobantes to any user's folder
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
