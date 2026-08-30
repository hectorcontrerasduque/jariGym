-- Migration 042: Renombra gym_config a inglés + recrea gym_config_payment_methods
-- Recrea ambas tablas para forzar orden exacto de columnas.
-- Elimina moneda y timezone. Agrega audit fields a gym_config.

-- ============================================================
-- PARTE 1: gym_config — Recrear tabla con orden exacto
-- ============================================================

-- 1.1 Eliminar triggers y policies viejas
DROP TRIGGER IF EXISTS trigger_gym_config_updated ON gym_config;
DROP TRIGGER IF EXISTS trigger_gym_config_audit ON gym_config;
DROP POLICY IF EXISTS "Super admins can read gym config" ON gym_config;
DROP POLICY IF EXISTS "Super admins can update gym config" ON gym_config;
DROP POLICY IF EXISTS "Super admins can insert gym config" ON gym_config;
DROP POLICY IF EXISTS "Anyone can read gym config" ON gym_config;
DROP POLICY IF EXISTS "Super admins can manage gym config" ON gym_config;

-- 1.2 Crear tabla nueva con orden exacto del usuario
CREATE TABLE gym_config_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text,
  gym_name text DEFAULT 'GymApp',
  max_members int DEFAULT 100,
  address text,
  phone_number text,
  contact_email text,
  schedule text,
  owner_name text,
  owner_email text,
  owner_phone text,
  billing_mode text DEFAULT 'dia_uno' CHECK (billing_mode IN ('dia_uno', 'fecha_inscripcion')),
  notifications_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 1.3 Copiar datos (mapeando nombres viejos → nuevos)
INSERT INTO gym_config_new (
  id, logo_url, gym_name, max_members, address, phone_number,
  contact_email, schedule, owner_name, owner_email, owner_phone,
  billing_mode, notifications_enabled, created_at, updated_at
)
SELECT
  id, logo_url, nombre_gym, max_miembros, direccion, telefono,
  email_contacto, horario, dueno_nombre, dueno_email, dueno_telefono,
  modo_cobro, notificaciones_enabled, created_at, updated_at
FROM gym_config;

-- 1.4 Eliminar tabla vieja y renombrar
DROP TABLE gym_config CASCADE;
ALTER TABLE gym_config_new RENAME TO gym_config;

-- 1.5 Recrear RLS policies
ALTER TABLE gym_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read gym config"
  ON gym_config FOR SELECT
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can update gym config"
  ON gym_config FOR UPDATE
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can insert gym config"
  ON gym_config FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

-- 1.6 Trigger de updated_at
CREATE TRIGGER trigger_gym_config_updated
  BEFORE UPDATE ON gym_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 1.7 Trigger de auditoria (created_by en INSERT, updated_by en INSERT/UPDATE)
CREATE OR REPLACE FUNCTION set_gym_config_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_gym_config_audit
  BEFORE INSERT OR UPDATE ON gym_config
  FOR EACH ROW EXECUTE FUNCTION set_gym_config_audit();

-- ============================================================
-- PARTE 2: gym_config_payment_methods — Recrear tabla
-- ============================================================

-- 2.1 Eliminar tabla vieja
DROP TABLE IF EXISTS gym_config_metodos_pago CASCADE;

-- 2.2 Crear tabla nueva con orden exacto del usuario
CREATE TABLE gym_config_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo', 'bs', 'binance')),
  amount_monthly decimal(10,2) NOT NULL DEFAULT 0,
  amount_inscription decimal(10,2) NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2.3 Index: solo 1 activo por payment_method
CREATE UNIQUE INDEX idx_payment_methods_active
  ON gym_config_payment_methods(payment_method) WHERE is_active = true;

-- 2.4 Trigger de updated_at
CREATE TRIGGER trigger_payment_methods_updated
  BEFORE UPDATE ON gym_config_payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2.5 RLS
ALTER TABLE gym_config_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage payment methods"
  ON gym_config_payment_methods FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

-- ============================================================
-- PARTE 3: Descripciones — gym_config
-- ============================================================

COMMENT ON TABLE gym_config IS 'Configuracion general del gimnasio. Solo super_admin puede leer/escribir.';

COMMENT ON COLUMN gym_config.id IS 'Identificador unico de la configuracion';
COMMENT ON COLUMN gym_config.logo_url IS 'URL del logo del gym en Supabase Storage';
COMMENT ON COLUMN gym_config.gym_name IS 'Nombre del gimnasio';
COMMENT ON COLUMN gym_config.max_members IS 'Capacidad maxima de miembros activos';
COMMENT ON COLUMN gym_config.address IS 'Direccion fisica del gimnasio';
COMMENT ON COLUMN gym_config.phone_number IS 'Numero de telefono del gimnasio con codigo de pais';
COMMENT ON COLUMN gym_config.contact_email IS 'Correo electronico de contacto del gym';
COMMENT ON COLUMN gym_config.schedule IS 'Horario de operacion del gym (ej: Lun-Sab 6am-10pm)';
COMMENT ON COLUMN gym_config.owner_name IS 'Nombre completo del propietario/dueno del gym';
COMMENT ON COLUMN gym_config.owner_email IS 'Correo del propietario. Se usa para login como super_admin';
COMMENT ON COLUMN gym_config.owner_phone IS 'Numero de WhatsApp del propietario para notificaciones';
COMMENT ON COLUMN gym_config.billing_mode IS 'Modo de cobro: dia_uno (1er dia del mes) o fecha_inscripcion (fecha de inicio del miembro)';
COMMENT ON COLUMN gym_config.notifications_enabled IS 'Habilita el sistema de notificaciones por email/whatsapp';
COMMENT ON COLUMN gym_config.created_at IS 'Fecha y hora de creacion del registro';
COMMENT ON COLUMN gym_config.updated_at IS 'Fecha y hora de ultima modificacion (auto-update trigger)';
COMMENT ON COLUMN gym_config.created_by IS 'UUID del usuario que creo la configuracion';
COMMENT ON COLUMN gym_config.updated_by IS 'UUID del ultimo usuario que modifico la configuracion';

-- ============================================================
-- PARTE 4: Descripciones — gym_config_payment_methods
-- ============================================================

COMMENT ON TABLE gym_config_payment_methods IS 'Metodos de pago configurados con montos y vigencia. Solo 1 activo por metodo.';

COMMENT ON COLUMN gym_config_payment_methods.id IS 'Identificador unico del metodo de pago';
COMMENT ON COLUMN gym_config_payment_methods.payment_method IS 'Tipo de metodo de pago: efectivo, bs, binance';
COMMENT ON COLUMN gym_config_payment_methods.amount_monthly IS 'Monto de la mensualidad en la moneda del metodo';
COMMENT ON COLUMN gym_config_payment_methods.amount_inscription IS 'Monto de la inscripcion (pago unico de registro)';
COMMENT ON COLUMN gym_config_payment_methods.is_active IS 'Si este metodo de pago esta habilitado. Solo puede haber 1 registro activo por payment_method';
COMMENT ON COLUMN gym_config_payment_methods.effective_from IS 'Fecha de vigencia desde (dia en que aplica la tarifa)';
COMMENT ON COLUMN gym_config_payment_methods.effective_to IS 'Fecha de vigencia hasta. NULL = vigente (aun activo)';
COMMENT ON COLUMN gym_config_payment_methods.created_at IS 'Fecha y hora de creacion del registro';
COMMENT ON COLUMN gym_config_payment_methods.updated_at IS 'Fecha y hora de ultima modificacion (auto-update trigger)';
