-- =============================================
-- FIX: Infinite recursion in RLS policies
-- =============================================

-- 1. Create helper function to get current user role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Create helper function to get current user tenant_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Drop ALL existing policies on profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their tenant" ON profiles;

-- 4. Recreate profiles policies using helper functions (no recursion)
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles in their tenant"
  ON profiles FOR SELECT
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Admins can insert profiles in their tenant"
  ON profiles FOR INSERT
  WITH CHECK (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Admins can update profiles in their tenant"
  ON profiles FOR UPDATE
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- 5. Fix pagos policies
DROP POLICY IF EXISTS "Members can insert own pagos" ON pagos;
DROP POLICY IF EXISTS "Members can view own pagos" ON pagos;
DROP POLICY IF EXISTS "Admins can view all pagos in tenant" ON pagos;
DROP POLICY IF EXISTS "Admins can update pagos in tenant" ON pagos;

CREATE POLICY "Members can insert own pagos"
  ON pagos FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Members can view own pagos"
  ON pagos FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can view all pagos in tenant"
  ON pagos FOR SELECT
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Admins can update pagos in tenant"
  ON pagos FOR UPDATE
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- 6. Fix membresias policies
DROP POLICY IF EXISTS "Members can view own membresia" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias in tenant" ON membresias;

CREATE POLICY "Members can view own membresia"
  ON membresias FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can manage membresias in tenant"
  ON membresias FOR ALL
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- 7. Fix planes policies
DROP POLICY IF EXISTS "Anyone can view active planes in tenant" ON planes;
DROP POLICY IF EXISTS "Admins can manage planes in tenant" ON planes;

CREATE POLICY "Anyone can view active planes in tenant"
  ON planes FOR SELECT
  USING (activo = true);

CREATE POLICY "Admins can manage planes in tenant"
  ON planes FOR ALL
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- 8. Fix gym_config policies
DROP POLICY IF EXISTS "Anyone can read gym config" ON gym_config;
DROP POLICY IF EXISTS "Admins can update gym config" ON gym_config;
DROP POLICY IF EXISTS "Admins can insert gym config" ON gym_config;

CREATE POLICY "Anyone can read gym config"
  ON gym_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can update gym config"
  ON gym_config FOR UPDATE
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Admins can insert gym config"
  ON gym_config FOR INSERT
  WITH CHECK (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- 9. Fix notificaciones_log policies
DROP POLICY IF EXISTS "Admins can view notis log in tenant" ON notificaciones_log;

CREATE POLICY "Admins can view notis log in tenant"
  ON notificaciones_log FOR SELECT
  USING (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- 10. Fix tenants policies
DROP POLICY IF EXISTS "Super admins can manage tenants" ON tenants;
DROP POLICY IF EXISTS "Users can view their own tenant" ON tenants;

CREATE POLICY "Super admins can manage tenants"
  ON tenants FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Users can view their own tenant"
  ON tenants FOR SELECT
  USING (id = get_user_tenant_id());
