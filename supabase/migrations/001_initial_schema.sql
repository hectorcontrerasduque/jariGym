-- =============================================
-- GYMAPP SaaS - Initial Schema
-- Multi-tenant gym management system
-- =============================================

-- =============================================
-- 1. TENANTS (Cada gym es un tenant)
-- =============================================
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  activo boolean DEFAULT true,
  plan_suscripcion text DEFAULT 'free' CHECK (plan_suscripcion IN ('free', 'basic', 'pro', 'enterprise')),
  max_miembros int DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- =============================================
-- 2. PROFILES (Usuarios de cada gym)
-- =============================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  nombre_completo text NOT NULL,
  avatar_url text,
  telefono text,
  role text NOT NULL DEFAULT 'miembro' CHECK (role IN ('super_admin', 'admin', 'miembro')),
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- =============================================
-- 3. PLANES DE MEMBRESIA
-- =============================================
CREATE TABLE planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  precio decimal(10,2) NOT NULL,
  duracion_dias int NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_planes_tenant ON planes(tenant_id);

-- =============================================
-- 4. MEMBRESIAS
-- =============================================
CREATE TABLE membresias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES planes(id) ON DELETE SET NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  estado text DEFAULT 'activa' CHECK (estado IN ('activa', 'vencida', 'cancelada')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_membresias_tenant ON membresias(tenant_id);
CREATE INDEX idx_membresias_usuario ON membresias(usuario_id);
CREATE INDEX idx_membresias_estado ON membresias(estado);

-- =============================================
-- 5. PAGOS
-- =============================================
CREATE TABLE pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  membresia_id uuid REFERENCES membresias(id) ON DELETE SET NULL,
  monto decimal(10,2) NOT NULL,
  comprobante_url text,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  notas text,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  mes_pagar int NOT NULL CHECK (mes_pagar BETWEEN 1 AND 12),
  anio_pagar int NOT NULL CHECK (anio_pagar BETWEEN 2020 AND 2099),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pagos_tenant ON pagos(tenant_id);
CREATE INDEX idx_pagos_usuario ON pagos(usuario_id);
CREATE INDEX idx_pagos_estado ON pagos(estado);
CREATE INDEX idx_pagos_fecha ON pagos(anio_pagar, mes_pagar);

-- =============================================
-- 6. GYM CONFIGURACION
-- =============================================
CREATE TABLE gym_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  logo_url text,
  direccion text,
  telefono text,
  email_contacto text,
  horario text,
  dueno_nombre text,
  dueno_email text,
  dueno_telefono text,
  moneda text DEFAULT 'USD',
  timezone text DEFAULT 'America/Mexico_City',
  color_primario text DEFAULT '#38BDF8',
  color_secundario text DEFAULT '#818CF8',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =============================================
-- 7. NOTIFICACIONES CONFIG
-- =============================================
CREATE TABLE notificaciones_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  whatsapp_enabled boolean DEFAULT true,
  email_enabled boolean DEFAULT true,
  whatsapp_number text,
  recordatorio_dias_antes int DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- 8. NOTIFICACIONES LOG
-- =============================================
CREATE TABLE notificaciones_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('pago_pendiente', 'pago_atrasado', 'pago_confirmado', 'membresia_vence')),
  canal text NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  enviado boolean DEFAULT false,
  error text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notis_log_tenant ON notificaciones_log(tenant_id);

-- =============================================
-- 9. FUNCTIONS
-- =============================================

-- Auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER trigger_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_pagos_updated
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_gym_config_updated
  BEFORE UPDATE ON gym_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tenants_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-crear profile cuando un usuario se registra
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre_completo, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.raw_user_meta_data->>'full_name', 'Sin nombre'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'miembro'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para auto-crear profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- 10. RLS (Row Level Security)
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresias ENABLE ROW LEVEL SECURITY;
ALTER TABLE planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 11. RLS POLICIES
-- =============================================

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles in their tenant"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = profiles.tenant_id
    )
  );

CREATE POLICY "Admins can insert profiles in their tenant"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = profiles.tenant_id
    )
  );

CREATE POLICY "Admins can update profiles in their tenant"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = profiles.tenant_id
    )
  );

-- PAGOS
CREATE POLICY "Members can insert own pagos"
  ON pagos FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Members can view own pagos"
  ON pagos FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can view all pagos in tenant"
  ON pagos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = pagos.tenant_id
    )
  );

CREATE POLICY "Admins can update pagos in tenant"
  ON pagos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = pagos.tenant_id
    )
  );

-- MEMBRESIAS
CREATE POLICY "Members can view own membresia"
  ON membresias FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admins can manage membresias in tenant"
  ON membresias FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = membresias.tenant_id
    )
  );

-- PLANES
CREATE POLICY "Anyone can view active planes in tenant"
  ON planes FOR SELECT
  USING (activo = true);

CREATE POLICY "Admins can manage planes in tenant"
  ON planes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = planes.tenant_id
    )
  );

-- GYM CONFIG
CREATE POLICY "Anyone can read gym config"
  ON gym_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can update gym config"
  ON gym_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = gym_config.tenant_id
    )
  );

CREATE POLICY "Admins can insert gym config"
  ON gym_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = gym_config.tenant_id
    )
  );

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
CREATE POLICY "Admins can view notis log in tenant"
  ON notificaciones_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND tenant_id = notificaciones_log.tenant_id
    )
  );

-- TENANTS
CREATE POLICY "Super admins can manage tenants"
  ON tenants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own tenant"
  ON tenants FOR SELECT
  USING (
    id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- =============================================
-- 12. STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('comprobantes', 'comprobantes', false);

-- Storage policies
CREATE POLICY "Avatar upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatar public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Comprobante upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'comprobantes');

CREATE POLICY "Comprobante read by owner"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comprobantes');

-- =============================================
-- 13. INSERTAR TENANT DE EJEMPLO
-- =============================================
INSERT INTO tenants (nombre, slug, plan_suscripcion, max_miembros)
VALUES ('Gym Elite Fitness', 'gym-elite', 'pro', 100);

-- Insertar planes de ejemplo para el tenant
INSERT INTO planes (tenant_id, nombre, precio, duracion_dias)
SELECT
  t.id,
  p.nombre,
  p.precio,
  p.duracion_dias
FROM tenants t
CROSS JOIN (VALUES
  ('Mensual', 29.99, 30),
  ('Trimestral', 79.99, 90),
  ('Anual', 299.99, 365)
) AS p(nombre, precio, duracion_dias)
WHERE t.slug = 'gym-elite';
