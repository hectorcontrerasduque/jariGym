-- =============================================
-- 008: Add nombre_gym, member_states audit table
-- =============================================

-- Add nombre_gym to gym_config
ALTER TABLE gym_config ADD COLUMN IF NOT EXISTS nombre_gym text DEFAULT 'GymApp';

-- Create member_states audit table
CREATE TABLE IF NOT EXISTS member_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  estado text NOT NULL CHECK (estado IN ('activo', 'suspendido', 'inactivo')),
  notas text,
  changed_by uuid REFERENCES profiles(id),
  fecha_evidencia timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_member_states_usuario ON member_states(usuario_id);
CREATE INDEX idx_member_states_tenant ON member_states(tenant_id);
CREATE INDEX idx_member_states_fecha ON member_states(usuario_id, fecha_evidencia DESC);

-- Enable RLS
ALTER TABLE member_states ENABLE ROW LEVEL SECURITY;

-- RLS policies for member_states
CREATE POLICY "Users can view member states in their tenant"
  ON member_states FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert member states"
  ON member_states FOR INSERT
  WITH CHECK (
    get_user_role() IN ('super_admin', 'admin')
    AND tenant_id = get_user_tenant_id()
  );

-- Add monto_inscripcion_pagado column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monto_inscripcion_pagado decimal(10,2) DEFAULT 0;

-- Add inscripcion_fecha column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inscripcion_fecha timestamptz;
