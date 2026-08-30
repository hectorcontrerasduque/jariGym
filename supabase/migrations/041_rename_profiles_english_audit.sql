-- Migration 041: Rename profiles columns to English + audit fields
-- Reorders columns to user-specified order, adds created_by/updated_by,
-- drops horario_entreno, adds table/column descriptions.

-- 1. Drop old trigger before table recreation
DROP TRIGGER IF EXISTS trigger_profiles_updated ON profiles;
DROP TRIGGER IF EXISTS trigger_profiles_audit ON profiles;

-- 2. Recreate table with correct order and new columns
CREATE TABLE profiles_new (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'miembro' CHECK (role IN ('super_admin', 'miembro')),
  email text UNIQUE,
  document_id text,
  full_name text NOT NULL,
  start_date timestamptz DEFAULT now(),
  phone_number text,
  avatar_url text,
  arrival_time text DEFAULT '--:--',
  departure_time text DEFAULT '--:--',
  inscription_amount_paid decimal(10,2) DEFAULT 0,
  inscription_paid boolean DEFAULT false,
  inscription_date timestamptz,
  inscription_admin_note text,
  activo boolean DEFAULT true,
  registered boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Copy data with column mapping
INSERT INTO profiles_new (
  id, role, email, document_id, full_name, start_date, phone_number,
  avatar_url, arrival_time, departure_time, inscription_amount_paid,
  inscription_paid, inscription_date, inscription_admin_note, activo,
  registered, created_at, updated_at
)
SELECT
  id, role, email, cedula, nombre_completo, fecha_inicio, whatsapp,
  avatar_url, hora_llegada, hora_salida, monto_inscripcion_pagado,
  inscripcion_pagada, inscripcion_fecha, inscripcion_nota_admin, activo,
  registered, created_at, updated_at
FROM profiles;

-- 4. Drop old table and rename new
DROP TABLE profiles CASCADE;
ALTER TABLE profiles_new RENAME TO profiles;

-- 5. Recreate updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Create audit trigger (set created_by on INSERT, updated_by on INSERT/UPDATE)
CREATE OR REPLACE FUNCTION set_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_profiles_audit
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

-- 7. Recreate RLS policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can update profiles"
  ON profiles FOR UPDATE
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

-- 8. Recreate handle_new_user trigger with new column names
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email, role, inscription_paid)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'nombre_completo', 'Sin nombre'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NEW.email,
    'miembro',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_document_id ON profiles(document_id);

-- 10. Table and column descriptions
COMMENT ON TABLE profiles IS 'Perfiles de usuarios del gimnasio. Roles: super_admin, miembro.';
COMMENT ON COLUMN profiles.id IS 'UUID del usuario en auth.users';
COMMENT ON COLUMN profiles.role IS 'Rol del usuario: super_admin o miembro';
COMMENT ON COLUMN profiles.email IS 'Correo electronico del usuario';
COMMENT ON COLUMN profiles.document_id IS 'Cedula o documento de identidad';
COMMENT ON COLUMN profiles.full_name IS 'Nombre completo del usuario';
COMMENT ON COLUMN profiles.start_date IS 'Fecha de inicio en el gimnasio';
COMMENT ON COLUMN profiles.phone_number IS 'Numero de telefono/WhatsApp';
COMMENT ON COLUMN profiles.avatar_url IS 'URL de la foto de perfil';
COMMENT ON COLUMN profiles.arrival_time IS 'Hora de llegada al gym (HH:MM, 24h)';
COMMENT ON COLUMN profiles.departure_time IS 'Hora de salida del gym (HH:MM, 24h)';
COMMENT ON COLUMN profiles.inscription_amount_paid IS 'Monto pagado por inscripcion';
COMMENT ON COLUMN profiles.inscription_paid IS 'Si la inscripcion ha sido pagada';
COMMENT ON COLUMN profiles.inscription_date IS 'Fecha en que se pago la inscripcion';
COMMENT ON COLUMN profiles.inscription_admin_note IS 'Nota del admin sobre la inscripcion';
COMMENT ON COLUMN profiles.activo IS 'Si la cuenta esta activa (null = activo legacy)';
COMMENT ON COLUMN profiles.registered IS 'Si el usuario completo registro y puede login';
COMMENT ON COLUMN profiles.created_by IS 'UUID del usuario que creo este registro';
COMMENT ON COLUMN profiles.updated_by IS 'UUID del ultimo usuario que modified este registro';
COMMENT ON COLUMN profiles.created_at IS 'Timestamp de creacion';
COMMENT ON COLUMN profiles.updated_at IS 'Timestamp de ultima modificacion';
