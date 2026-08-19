-- Migration 019: Create atomic RPC functions for multi-write operations
-- These functions wrap multiple writes in a single PostgreSQL transaction

-- 1. aprobar_pago_atomico: Approve a payment and update inscription status atomically
CREATE OR REPLACE FUNCTION aprobar_pago_atomico(p_pago_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pago JSONB;
  v_notas TEXT;
  v_is_inscripcion BOOLEAN;
BEGIN
  IF get_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Update the payment status
  UPDATE pagos
  SET estado = 'aprobado',
      approved_by = p_user_id,
      approved_at = NOW(),
      fecha_pago_real = NOW()
  WHERE id = p_pago_id
  RETURNING to_jsonb(pagos.*) INTO v_pago;

  IF v_pago IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  -- Check if this is an inscription payment
  v_notas := LOWER(COALESCE(v_pago->>'notas', ''));
  v_is_inscripcion := v_notas LIKE '%inscripción%' OR v_notas LIKE '%inscripcion%';

  -- Update inscription status if applicable
  IF v_is_inscripcion THEN
    UPDATE profiles
    SET inscripcion_pagada = true,
        inscripcion_fecha = NOW()
    WHERE id = (v_pago->>'usuario_id')::UUID;
  END IF;

  RETURN v_pago;
END;
$$;

-- 2. toggle_membresia_libre: Toggle free membership atomically
CREATE OR REPLACE FUNCTION toggle_membresia_libre(
  p_usuario_id UUID,
  p_asignado_por UUID,
  p_asignado_por_nombre TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  IF get_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Check for existing active membership
  SELECT id INTO v_existing_id
  FROM membresias
  WHERE usuario_id = p_usuario_id
    AND fecha_fin IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Remove free membership
    UPDATE membresias
    SET fecha_fin = NOW()
    WHERE id = v_existing_id;
  ELSE
    -- Assign free membership
    INSERT INTO membresias (usuario_id, fecha_inicio, fecha_fin, estado, asignado_por, asignado_por_nombre)
    VALUES (p_usuario_id, NOW(), NULL, 'activa', p_asignado_por, p_asignado_por_nombre);
  END IF;
END;
$$;

-- 3. actualizar_estado_miembro: Update member status and create audit log atomically
CREATE OR REPLACE FUNCTION actualizar_estado_miembro(
  p_usuario_id UUID,
  p_activo BOOLEAN,
  p_changed_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF get_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Update profile status
  UPDATE profiles
  SET activo = p_activo
  WHERE id = p_usuario_id;

  -- Create audit log entry
  INSERT INTO member_states (usuario_id, estado, changed_by, notas)
  VALUES (
    p_usuario_id,
    CASE WHEN p_activo THEN 'activo' ELSE 'inactivo' END,
    p_changed_by,
    CASE WHEN p_activo THEN 'Miembro activado' ELSE 'Miembro desactivado' END
  );
END;
$$;

-- 4. actualizar_metodo_pago_atomico: Soft delete old record and insert new one atomically
CREATE OR REPLACE FUNCTION actualizar_metodo_pago_atomico(
  p_id UUID,
  p_monto_mensual NUMERIC,
  p_monto_inscripcion NUMERIC,
  p_habilitado BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current RECORD;
  v_new_record JSONB;
BEGIN
  IF get_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Get current record
  SELECT metodo_pago, monto_mensual, monto_inscripcion, habilitado
  INTO v_current
  FROM gym_config_metodos_pago
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Método de pago no encontrado';
  END IF;

  -- Check if anything changed
  IF v_current.monto_mensual = p_monto_mensual
     AND v_current.monto_inscripcion = p_monto_inscripcion
     AND v_current.habilitado = p_habilitado THEN
    RETURN jsonb_build_object(
      'id', p_id,
      'metodo_pago', v_current.metodo_pago,
      'monto_mensual', v_current.monto_mensual,
      'monto_inscripcion', v_current.monto_inscripcion,
      'habilitado', v_current.habilitado
    );
  END IF;

  -- Disable old record
  UPDATE gym_config_metodos_pago
  SET habilitado = false
  WHERE id = p_id;

  -- Insert new record
  INSERT INTO gym_config_metodos_pago (metodo_pago, monto_mensual, monto_inscripcion, habilitado)
  VALUES (v_current.metodo_pago, p_monto_mensual, p_monto_inscripcion, p_habilitado)
  RETURNING to_jsonb(gym_config_metodos_pago.*) INTO v_new_record;

  RETURN v_new_record;
END;
$$;

-- 5. crear_miembro_completo: Create profile and member state atomically (auth user must be created first via admin API)
CREATE OR REPLACE FUNCTION crear_miembro_completo(
  p_user_id UUID,
  p_nombre TEXT,
  p_email TEXT,
  p_changed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile JSONB;
BEGIN
  IF get_user_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Upsert profile
  INSERT INTO profiles (id, nombre_completo, role, email, inscripcion_pagada)
  VALUES (p_user_id, p_nombre, 'miembro', p_email, false)
  ON CONFLICT (id) DO UPDATE
  SET nombre_completo = p_nombre,
      email = p_email
  RETURNING to_jsonb(profiles.*) INTO v_profile;

  -- Create audit log
  INSERT INTO member_states (usuario_id, estado, changed_by, notas)
  VALUES (p_user_id, 'activo', p_changed_by, 'Miembro creado');

  RETURN v_profile;
END;
$$;
