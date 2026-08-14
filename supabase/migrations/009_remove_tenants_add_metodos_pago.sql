-- =============================================
-- 009: Remove multi-tenancy, add gym_config_metodos_pago
-- Single-gym system: all tenant_id removed
-- =============================================

-- 1. Helper function to get current user role (SECURITY DEFINER breaks RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Add max_miembros to gym_config
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS max_miembros int DEFAULT 50;

-- 3. Remove per-method columns from gym_config (moving to gym_config_metodos_pago)
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_mensual_bs;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_inscripcion_bs;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_mensual_binance;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_inscripcion_binance;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_mensual_transferencia;
ALTER TABLE gym_config DROP COLUMN IF EXISTS monto_inscripcion_transferencia;
ALTER TABLE gym_config DROP COLUMN IF EXISTS acepta_bs;
ALTER TABLE gym_config DROP COLUMN IF EXISTS acepta_binance;
ALTER TABLE gym_config DROP COLUMN IF EXISTS acepta_transferencia;
ALTER TABLE gym_config DROP COLUMN IF EXISTS acepta_efectivo;

-- 4. Create gym_config_metodos_pago table
CREATE TABLE IF NOT EXISTS gym_config_metodos_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metodo_pago text NOT NULL CHECK (metodo_pago IN ('efectivo', 'bs', 'binance', 'transferencia')),
  monto_mensual decimal(10,2) NOT NULL DEFAULT 0,
  monto_inscripcion decimal(10,2) NOT NULL DEFAULT 0,
  habilitado boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_metodos_pago_nombre ON gym_config_metodos_pago(metodo_pago);

ALTER TABLE gym_config_metodos_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read metodos pago"
  ON gym_config_metodos_pago FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage metodos pago"
  ON gym_config_metodos_pago FOR ALL
  USING (get_user_role() IN ('super_admin', 'admin'));


-- 5. Drop ALL existing RLS policies on affected tables
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their tenant" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

DROP POLICY IF EXISTS "Members can insert own pagos" ON pagos;
DROP POLICY IF EXISTS "Members can view own pagos" ON pagos;
DROP POLICY IF EXISTS "Admins can view all pagos in tenant" ON pagos;
DROP POLICY IF EXISTS "Admins can update pagos in tenant" ON pagos;
DROP POLICY IF EXISTS "Admins can view all pagos" ON pagos;
DROP POLICY IF EXISTS "Admins can update pagos" ON pagos;

DROP POLICY IF EXISTS "Members can view own membresia" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias in tenant" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias" ON membresias;

DROP POLICY IF EXISTS "Anyone can view active planes in tenant" ON planes;
DROP POLICY IF EXISTS "Admins can manage planes in tenant" ON planes;
DROP POLICY IF EXISTS "Anyone can view active planes" ON planes;
DROP POLICY IF EXISTS "Admins can manage planes" ON planes;

DROP POLICY IF EXISTS "Anyone can read gym config" ON gym_config;
DROP POLICY IF EXISTS "Admins can update gym config" ON gym_config;
DROP POLICY IF EXISTS "Admins can insert gym config" ON gym_config;

DROP POLICY IF EXISTS "Users can view own notis config" ON notificaciones_config;
DROP POLICY IF EXISTS "Users can update own notis config" ON notificaciones_config;
DROP POLICY IF EXISTS "Users can insert own notis config" ON notificaciones_config;

DROP POLICY IF EXISTS "Admins can view notis log in tenant" ON notificaciones_log;
DROP POLICY IF EXISTS "Admins can view notis log" ON notificaciones_log;

DROP POLICY IF EXISTS "Super admins can manage tenants" ON tenants;
DROP POLICY IF EXISTS "Users can view their own tenant" ON tenants;

DROP POLICY IF EXISTS "Users can view member states in their tenant" ON member_states;
DROP POLICY IF EXISTS "Admins can insert member states" ON member_states;
DROP POLICY IF EXISTS "Users can view member states" ON member_states;

-- 6. Recreate RLS policies using get_user_role() (no recursion)
-- PROFILES
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

-- PAGOS
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

-- MEMBRESIAS
CREATE POLICY "Members can view own membresia"
  ON membresias FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can manage membresias"
  ON membresias FOR ALL
  USING (get_user_role() IN ('super_admin', 'admin'));

-- PLANES
CREATE POLICY "Anyone can view active planes"
  ON planes FOR SELECT
  USING (activo = true);

CREATE POLICY "Admins can manage planes"
  ON planes FOR ALL
  USING (get_user_role() IN ('super_admin', 'admin'));

-- GYM CONFIG
CREATE POLICY "Anyone can read gym config"
  ON gym_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can update gym config"
  ON gym_config FOR UPDATE
  USING (get_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins can insert gym config"
  ON gym_config FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- NOTIFICACIONES CONFIG
CREATE POLICY "Users can view own notis config"
  ON notificaciones_config FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Users can update own notis config"
  ON notificaciones_config FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Users can insert own notis config"
  ON notificaciones_config FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- NOTIFICACIONES LOG
CREATE POLICY "Admins can view notis log"
  ON notificaciones_log FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

-- MEMBER_STATES
CREATE POLICY "Users can view member states"
  ON member_states FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert member states"
  ON member_states FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- 7. Drop tenant_id columns from all tables
ALTER TABLE profiles DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE planes DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE membresias DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE pagos DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE gym_config DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE notificaciones_log DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE member_states DROP COLUMN IF EXISTS tenant_id;

-- Drop tenant_id indexes
DROP INDEX IF EXISTS idx_profiles_tenant;
DROP INDEX IF EXISTS idx_planes_tenant;
DROP INDEX IF EXISTS idx_membresias_tenant;
DROP INDEX IF EXISTS idx_pagos_tenant;
DROP INDEX IF EXISTS idx_notis_log_tenant;
DROP INDEX IF EXISTS idx_member_states_tenant;

-- Drop old function and table
DROP FUNCTION IF EXISTS public.get_user_tenant_id();
DROP TABLE IF EXISTS tenants CASCADE;

