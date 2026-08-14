-- =============================================
-- 010: Fix RLS recursion + add get_user_role()
-- Fixes infinite recursion in profiles policies
-- =============================================

-- 1. Create SECURITY DEFINER function to break RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Drop ALL existing policies on profiles to start clean
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- 3. Recreate profiles policies using get_user_role()
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 4. Fix pagos policies
DROP POLICY IF EXISTS "Members can insert own pagos" ON pagos;
DROP POLICY IF EXISTS "Members can view own pagos" ON pagos;
DROP POLICY IF EXISTS "Admins can view all pagos in tenant" ON pagos;
DROP POLICY IF EXISTS "Admins can update pagos in tenant" ON pagos;
DROP POLICY IF EXISTS "Admins can view all pagos" ON pagos;
DROP POLICY IF EXISTS "Admins can update pagos" ON pagos;

CREATE POLICY "Members can insert own pagos"
  ON pagos FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Members can view own pagos"
  ON pagos FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can view all pagos"
  ON pagos FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins can update pagos"
  ON pagos FOR UPDATE
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 5. Fix membresias policies
DROP POLICY IF EXISTS "Members can view own membresia" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias in tenant" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias" ON membresias;

CREATE POLICY "Members can view own membresia"
  ON membresias FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can manage membresias"
  ON membresias FOR ALL
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 6. Fix planes policies
DROP POLICY IF EXISTS "Anyone can view active planes in tenant" ON planes;
DROP POLICY IF EXISTS "Admins can manage planes in tenant" ON planes;
DROP POLICY IF EXISTS "Anyone can view active planes" ON planes;
DROP POLICY IF EXISTS "Admins can manage planes" ON planes;

CREATE POLICY "Anyone can view active planes"
  ON planes FOR SELECT
  USING (activo = true);

CREATE POLICY "Admins can manage planes"
  ON planes FOR ALL
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 7. Fix gym_config policies
DROP POLICY IF EXISTS "Anyone can read gym config" ON gym_config;
DROP POLICY IF EXISTS "Admins can update gym config" ON gym_config;
DROP POLICY IF EXISTS "Admins can insert gym config" ON gym_config;

CREATE POLICY "Anyone can read gym config"
  ON gym_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can update gym config"
  ON gym_config FOR UPDATE
  USING (get_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins can insert gym config"
  ON gym_config FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- 8. Fix notificaciones_config policies
DROP POLICY IF EXISTS "Users can view own notis config" ON notificaciones_config;
DROP POLICY IF EXISTS "Users can update own notis config" ON notificaciones_config;
DROP POLICY IF EXISTS "Users can insert own notis config" ON notificaciones_config;

CREATE POLICY "Users can view own notis config"
  ON notificaciones_config FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Users can update own notis config"
  ON notificaciones_config FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Users can insert own notis config"
  ON notificaciones_config FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- 9. Fix notificaciones_log policies
DROP POLICY IF EXISTS "Admins can view notis log in tenant" ON notificaciones_log;
DROP POLICY IF EXISTS "Admins can view notis log" ON notificaciones_log;

CREATE POLICY "Admins can view notis log"
  ON notificaciones_log FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 10. Fix member_states policies
DROP POLICY IF EXISTS "Users can view member states in their tenant" ON member_states;
DROP POLICY IF EXISTS "Admins can insert member states" ON member_states;
DROP POLICY IF EXISTS "Users can view member states" ON member_states;

CREATE POLICY "Users can view member states"
  ON member_states FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert member states"
  ON member_states FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));
