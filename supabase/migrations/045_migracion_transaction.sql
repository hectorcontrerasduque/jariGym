-- 045: Función RPC migrar_miembro_pago con transacción
-- Ejecuta todo el flujo de creación de pagos dentro de BEGIN/COMMIT
-- Si falla algo, ROLLBACK revierte todo

CREATE OR REPLACE FUNCTION migrar_miembro_pago(
  p_user_id uuid,
  p_pago_records jsonb,
  p_monto_mensual decimal,
  p_monto_inscripcion decimal,
  p_migracion_ids bigint[],
  p_fecha_inicio date,
  p_whatsapp text DEFAULT NULL,
  p_correo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  record jsonb;
  v_pago_id uuid;
  v_pago_estado text;
  v_existing_pago_id uuid;
  v_existing_detalle_id uuid;
  v_pagos_creados int := 0;
  v_pagos_actualizados int := 0;
  v_found_first_pagado boolean := false;
  v_mes int;
  v_anio int;
  v_estado text;
  v_pago_status text;
BEGIN
  -- Iterar sobre cada registro de migración
  FOR record IN SELECT * FROM jsonb_array_elements(p_pago_records)
  LOOP
    v_mes := (record->>'mes')::int;
    v_anio := (record->>'anio')::int;
    v_estado := record->>'estado';

    -- Mapear estado de migración a estado de pago
    IF v_estado = 'pagado' THEN
      v_pago_status := 'aprobado';
    ELSE
      v_pago_status := 'suspendido';
    END IF;

    -- Lógica de "foundFirstPagado": saltar suspendidos antes del primer pagado
    IF v_estado = 'pagado' THEN
      v_found_first_pagado := true;
    ELSIF v_estado = 'suspendido' AND NOT v_found_first_pagado THEN
      -- Skip: suspendido antes del primer pagado
      CONTINUE;
    END IF;

    -- Buscar si ya existe un pago para este usuario
    SELECT p.id INTO v_existing_pago_id
    FROM payments p
    WHERE p.user_id = p_user_id
    LIMIT 1;

    -- Buscar si ya existe un detalle para este mes/año
    IF v_existing_pago_id IS NOT NULL THEN
      SELECT pd.id INTO v_existing_detalle_id
      FROM payment_detail pd
      WHERE pd.payment_id = v_existing_pago_id
        AND pd.month_number = v_mes
        AND pd.year_number = v_anio
      LIMIT 1;
    ELSE
      v_existing_detalle_id := NULL;
    END IF;

    IF v_existing_detalle_id IS NOT NULL THEN
      -- Duplicate exists: update if pendiente/suspendido
      IF v_existing_pago_id IS NOT NULL THEN
        UPDATE payments
        SET status = v_pago_status,
            payment_note = 'Actualizado por migración de data',
            approved_at = CASE WHEN v_pago_status = 'aprobado' THEN now() ELSE NULL END
        WHERE id = v_existing_pago_id
          AND status IN ('pendiente', 'suspendido');

        UPDATE payment_detail
        SET payment_amount = p_monto_mensual
        WHERE payment_id = v_existing_pago_id
          AND month_number = v_mes
          AND year_number = v_anio;

        v_pagos_actualizados := v_pagos_actualizados + 1;
      END IF;
    ELSE
      -- No duplicate: insert new payment + detail
      INSERT INTO payments (user_id, status, payment_method, payment_note, approved_at)
      VALUES (
        p_user_id,
        v_pago_status,
        'efectivo',
        'Registro por migración de data',
        CASE WHEN v_pago_status = 'aprobado' THEN now() ELSE NULL END
      )
      RETURNING id INTO v_pago_id;

      IF v_pago_id IS NOT NULL THEN
        INSERT INTO payment_detail (payment_id, month_number, year_number, payment_type, payment_amount)
        VALUES (v_pago_id, v_mes, v_anio, 'mensualidad', p_monto_mensual);

        v_pagos_creados := v_pagos_creados + 1;
      END IF;
    END IF;
  END LOOP;

  -- Inscripción: buscar si ya existe
  IF NOT EXISTS (
    SELECT 1 FROM payment_detail pd
    JOIN payments p ON p.id = pd.payment_id
    WHERE p.user_id = p_user_id
      AND pd.payment_type = 'inscripcion'
  ) THEN
    IF p_monto_inscripcion > 0 THEN
      INSERT INTO payments (user_id, status, payment_method, payment_note, approved_at)
      VALUES (p_user_id, 'aprobado', 'efectivo', 'Inscripción - Registro por migración de data', now())
      RETURNING id INTO v_pago_id;

      IF v_pago_id IS NOT NULL THEN
        INSERT INTO payment_detail (payment_id, month_number, year_number, payment_type, payment_amount)
        VALUES (
          v_pago_id,
          EXTRACT(MONTH FROM p_fecha_inicio)::int,
          EXTRACT(YEAR FROM p_fecha_inicio)::int,
          'inscripcion',
          p_monto_inscripcion
        );
      END IF;
    END IF;

    -- Marcar inscripción pagada en profile
    UPDATE profiles
    SET inscription_paid = true,
        inscription_date = CURRENT_DATE
    WHERE id = p_user_id;
  END IF;

  -- Marcar registros de migración como completados + actualizar datos de contacto
  UPDATE migracion
  SET migrado = 'si',
      whatsapp = COALESCE(p_whatsapp, whatsapp),
      correo = COALESCE(p_correo, correo)
  WHERE id = ANY(p_migracion_ids);

  -- Retornar resultado
  RETURN jsonb_build_object(
    'pagos_creados', v_pagos_creados,
    'pagos_actualizados', v_pagos_actualizados
  );
END;
$$;
