-- =============================================
-- 1. UPDATE PROFILES TABLE - Remove 'admin' from CHECK constraint
-- =============================================

-- First, update any existing 'admin' profiles to 'miembro' (or 'super_admin' if they should be)
UPDATE public.profiles 
SET role = 'miembro' 
WHERE role = 'admin';

-- Add new CHECK constraint (will be named automatically)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check_v2 
  CHECK (role IN ('super_admin', 'miembro'));

-- =============================================
-- 2. UPDATE RLS POLICIES - Replace 'admin' with 'super_admin'
-- =============================================

-- Helper: Drop policy if exists and recreate with super_admin only

-- profiles policies
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Super admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Super admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (get_user_role() = 'super_admin');

-- pagos policies (normalized tables)
DROP POLICY IF EXISTS "Admins can view all pagos" ON public.pagos;
CREATE POLICY "Super admins can view all pagos"
  ON public.pagos FOR SELECT
  USING (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can insert pagos for any user" ON public.pagos;
CREATE POLICY "Super admins can insert pagos for any user"
  ON public.pagos FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can update pagos" ON public.pagos;
CREATE POLICY "Super admins can update pagos"
  ON public.pagos FOR UPDATE
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can delete pagos" ON public.pagos;
CREATE POLICY "Super admins can delete pagos"
  ON public.pagos FOR DELETE
  USING (get_user_role() = 'super_admin');

-- detalle_pago policies
DROP POLICY IF EXISTS "Admins can view all detalle" ON public.detalle_pago;
CREATE POLICY "Super admins can view all detalle"
  ON public.detalle_pago FOR SELECT
  USING (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can insert detalle for any user" ON public.detalle_pago;
CREATE POLICY "Super admins can insert detalle for any user"
  ON public.detalle_pago FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can update detalle" ON public.detalle_pago;
CREATE POLICY "Super admins can update detalle"
  ON public.detalle_pago FOR UPDATE
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can delete detalle" ON public.detalle_pago;
CREATE POLICY "Super admins can delete detalle"
  ON public.detalle_pago FOR DELETE
  USING (get_user_role() = 'super_admin');

-- membresias policies
DROP POLICY IF EXISTS "Admins can manage membresias" ON public.membresias;
CREATE POLICY "Super admins can manage membresias"
  ON public.membresias FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

-- gym_config policies
DROP POLICY IF EXISTS "Admins can read gym config" ON public.gym_config;
CREATE POLICY "Super admins can read gym config"
  ON public.gym_config FOR SELECT
  USING (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can update gym config" ON public.gym_config;
CREATE POLICY "Super admins can update gym config"
  ON public.gym_config FOR UPDATE
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can insert gym config" ON public.gym_config;
CREATE POLICY "Super admins can insert gym config"
  ON public.gym_config FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

-- gym_config_metodos_pago policies
DROP POLICY IF EXISTS "Admins can manage metodos pago" ON public.gym_config_metodos_pago;
CREATE POLICY "Super admins can manage metodos pago"
  ON public.gym_config_metodos_pago FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

-- notificacion_config policies
DROP POLICY IF EXISTS "Admins full access notificacion_config" ON public.notificacion_config;
CREATE POLICY "Super admins full access notificacion_config"
  ON public.notificacion_config FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

-- notificacion_log policies
DROP POLICY IF EXISTS "Admins can view notificacion_log" ON public.notificacion_log;
CREATE POLICY "Super admins can view notificacion_log"
  ON public.notificacion_log FOR SELECT
  USING (get_user_role() = 'super_admin');

-- member_states policies
DROP POLICY IF EXISTS "Admins can view member states" ON public.member_states;
CREATE POLICY "Super admins can view member states"
  ON public.member_states FOR SELECT
  USING (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Admins can insert member states" ON public.member_states;
CREATE POLICY "Super admins can insert member states"
  ON public.member_states FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

-- Storage policies (logos bucket)
DROP POLICY IF EXISTS "Admins can manage logos" ON storage.objects;
CREATE POLICY "Super admins can manage logos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'logos' AND get_user_role() = 'super_admin')
  WITH CHECK (bucket_id = 'logos' AND get_user_role() = 'super_admin');

-- Comprobantes policies (admin read)
DROP POLICY IF EXISTS "Comprobante read by owner" ON storage.objects;
CREATE POLICY "Comprobante read by owner or super_admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'comprobantes'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR get_user_role() = 'super_admin'
    )
  );

-- =============================================
-- 3. UPDATE RPC FUNCTIONS - Replace admin checks
-- =============================================

-- Update any RPC functions that check for 'admin' role
-- Note: These were dropped in migration 020, but if any exist, update them

-- =============================================
-- 4. UPDATE get_user_role() FUNCTION COMMENT
-- =============================================

COMMENT ON FUNCTION public.get_user_role() IS 
  'Returns user role: super_admin or miembro. admin role removed in migration 036.';

-- =============================================
-- 5. VERIFY NO 'admin' ROLE REMAINS
-- =============================================

DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
  IF admin_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % profiles still have admin role', admin_count;
  END IF;
  
  RAISE NOTICE 'Migration 036 completed successfully. Roles simplified to super_admin | miembro';
END $$;