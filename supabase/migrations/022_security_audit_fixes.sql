-- Migration 022: Security fixes — Storage policies, RLS, FKs, constraints
-- Addresses findings from comprehensive security audit

-- =============================================
-- 1. STORAGE POLICIES
-- =============================================

-- 1a. Comprobantes: restrict SELECT to owner or admin
DROP POLICY IF EXISTS "Comprobante read by owner" ON storage.objects;
CREATE POLICY "Comprobante read by owner"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'comprobantes'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR get_user_role() IN ('super_admin', 'admin')
    )
  );

-- 1b. Comprobantes: restrict INSERT to own folder
DROP POLICY IF EXISTS "Comprobante upload" ON storage.objects;
CREATE POLICY "Comprobante upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 1c. Avatars: restrict INSERT to own folder
DROP POLICY IF EXISTS "Avatar upload" ON storage.objects;
CREATE POLICY "Avatar upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 1d. Avatars: restrict SELECT to owner or admin
DROP POLICY IF EXISTS "Avatar read" ON storage.objects;
CREATE POLICY "Avatar read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR get_user_role() IN ('super_admin', 'admin')
    )
  );

-- 1e. Logos: admin only for all operations
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;
CREATE POLICY "Admins can manage logos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'logos' AND get_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (bucket_id = 'logos' AND get_user_role() IN ('super_admin', 'admin'));

-- =============================================
-- 2. RLS POLICY FIXES
-- =============================================

-- 2a. member_states: admin only SELECT (audit trail not for members)
DROP POLICY IF EXISTS "Users can view member states" ON member_states;
CREATE POLICY "Admins can view member states"
  ON member_states FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 2b. gym_config: admin only SELECT (contains owner PII)
DROP POLICY IF EXISTS "Anyone can read gym config" ON gym_config;
CREATE POLICY "Admins can read gym config"
  ON gym_config FOR SELECT
  USING (get_user_role() IN ('super_admin', 'admin'));

-- 2c. Admin UPDATE on profiles: add WITH CHECK to prevent role escalation between admins
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (get_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (get_user_role() IN ('super_admin', 'admin'));

-- =============================================
-- 3. FOREIGN KEY FIXES (ON DELETE SET NULL)
-- =============================================

-- 3a. pagos.approved_by — allow profile deletion
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_approved_by_fkey;
ALTER TABLE pagos ADD CONSTRAINT pagos_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 3b. member_states.changed_by — allow admin deletion
ALTER TABLE member_states DROP CONSTRAINT IF EXISTS member_states_changed_by_fkey;
ALTER TABLE member_states ADD CONSTRAINT member_states_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 3c. membresias.asignado_por — allow admin deletion
ALTER TABLE membresias DROP CONSTRAINT IF EXISTS membresias_asignado_por_fkey;
ALTER TABLE membresias ADD CONSTRAINT membresias_asignado_por_fkey
  FOREIGN KEY (asignado_por) REFERENCES profiles(id) ON DELETE SET NULL;

-- =============================================
-- 4. CONSTRAINTS & INDEXES
-- =============================================

-- 4a. UNIQUE constraint on profiles.email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
  END IF;
END $$;

-- 4b. Index on notificaciones_log.usuario_id
CREATE INDEX IF NOT EXISTS idx_notis_log_usuario ON notificaciones_log(usuario_id);

-- =============================================
-- 5. FUNCTION HARDENING
-- =============================================

-- 5a. Add SET search_path to handle_new_user trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre_completo, avatar_url, email, role, inscripcion_pagada)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.raw_user_meta_data->>'full_name', 'Sin nombre'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NEW.email,
    'miembro',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5b. Add SET search_path to get_user_role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
