-- Migration 048: memberships (renombrar membresias) + eliminar member_states
-- Tabla de movimientos: cada nuevo contrato desactiva el anterior y crea registro nuevo.
-- Los campos de profiles.start_date y memberships.start_date son independientes:
--   - profiles.start_date = fecha de ingreso al gym (para cálculo de morosidad/día de cobro)
--   - memberships.start_date = fecha de inicio de vigencia de la membresía

-- ============================================================
-- PARTE 1: Crear tabla memberships
-- ============================================================

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'vencida', 'cancelada')),
  start_date date NOT NULL,
  end_date date,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  membership_note text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE memberships IS 'Registro de membresías de los miembros del gimnasio. Tabla de movimientos: cada nuevo contrato desactiva el anterior (end_date = hoy, status = vencida) y crea un registro nuevo activo. Soporta perpetuidad (end_date = null) y vencimiento.';
COMMENT ON COLUMN memberships.id IS 'Identificador único de la membresía';
COMMENT ON COLUMN memberships.user_id IS 'ID del miembro dueño de la membresía';
COMMENT ON COLUMN memberships.status IS 'Estado: activa, vencida o cancelada';
COMMENT ON COLUMN memberships.start_date IS 'Fecha de inicio de la vigencia de la membresía';
COMMENT ON COLUMN memberships.end_date IS 'Fecha de expiración; null = perpetua (sin vencimiento)';
COMMENT ON COLUMN memberships.assigned_by IS 'ID del administrador que asignó la membresía';
COMMENT ON COLUMN memberships.membership_note IS 'Nota o justificación de la asignación';
COMMENT ON COLUMN memberships.created_at IS 'Fecha y hora de creación del registro';
COMMENT ON COLUMN memberships.created_by IS 'ID del usuario que creó el registro';
COMMENT ON COLUMN memberships.updated_at IS 'Fecha y hora de última modificación del registro';
COMMENT ON COLUMN memberships.updated_by IS 'ID del último usuario que modificó el registro';

-- ============================================================
-- PARTE 2: RLS en memberships
-- ============================================================

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Los miembros pueden ver su propia membresía
CREATE POLICY "Members can view own membership"
  ON memberships FOR SELECT
  USING (auth.uid() = user_id);

-- Super admins pueden gestionar todas las membresías
CREATE POLICY "Super admins can manage memberships"
  ON memberships FOR ALL
  USING (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

-- Usuarios autenticados pueden leer (para queries de vigencia/morosidad)
CREATE POLICY "Authenticated users can read memberships"
  ON memberships FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- PARTE 3: Índices en memberships
-- ============================================================

CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_memberships_user_status ON memberships(user_id, status);

-- ============================================================
-- PARTE 4: Trigger updated_at en memberships
-- ============================================================

CREATE TRIGGER trigger_memberships_updated
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PARTE 5: Trigger audit (created_by en INSERT, updated_by en INSERT/UPDATE)
-- ============================================================

CREATE OR REPLACE FUNCTION set_memberships_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_memberships_audit
  BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_memberships_audit();

-- ============================================================
-- PARTE 6: Migrar datos de membresias → memberships
-- ============================================================

-- Mapeo de estados:
--   'activa' + fecha_fin IS NULL          → 'activa'  (perpetua activa)
--   'activa' + fecha_fin >= current_date  → 'activa'  (vigente con vencimiento)
--   'activa' + fecha_fin <  current_date  → 'vencida' (expirada)
--   'vencida'                              → 'vencida'
--   'cancelada'                            → 'cancelada'

INSERT INTO memberships (id, user_id, status, start_date, end_date, assigned_by, membership_note, created_at)
SELECT
  id,
  usuario_id,
  CASE
    WHEN estado = 'cancelada' THEN 'cancelada'
    WHEN estado = 'vencida' THEN 'vencida'
    WHEN estado = 'activa' AND fecha_fin IS NULL THEN 'activa'
    WHEN estado = 'activa' AND fecha_fin >= CURRENT_DATE THEN 'activa'
    WHEN estado = 'activa' AND fecha_fin < CURRENT_DATE THEN 'vencida'
    ELSE 'vencida'
  END,
  fecha_inicio,
  fecha_fin,
  asignado_por,
  NULL,
  created_at
FROM membresias;

-- ============================================================
-- PARTE 7: Eliminar tablas viejas
-- ============================================================

-- Eliminar policies de member_states
DROP POLICY IF EXISTS "Super admins can view member states" ON member_states;
DROP POLICY IF EXISTS "Super admins can insert member states" ON member_states;
DROP POLICY IF EXISTS "Admins can view member states" ON member_states;
DROP POLICY IF EXISTS "Admins can insert member states" ON member_states;
DROP POLICY IF EXISTS "Users can view member states" ON member_states;
DROP POLICY IF EXISTS "Users can view member states in their tenant" ON member_states;

DROP TABLE IF EXISTS member_states CASCADE;

-- Eliminar policies de membresias
DROP POLICY IF EXISTS "Members can view own membresia" ON membresias;
DROP POLICY IF EXISTS "Super admins can manage membresias" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias" ON membresias;
DROP POLICY IF EXISTS "Admins can manage membresias in tenant" ON membresias;

DROP TABLE IF EXISTS membresias CASCADE;

-- ============================================================
-- PARTE 8: Eliminar RPC functions obsoletas (ya estaban droppadas en 020)
-- ============================================================

DROP FUNCTION IF EXISTS toggle_membresia_libre(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS actualizar_estado_miembro(UUID, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS crear_miembro_completo(TEXT, TEXT, UUID);
