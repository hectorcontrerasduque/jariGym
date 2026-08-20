-- 026: Limpiar tablas para re-migración
-- ADVERTENCIA: Ejecutar solo si se necesita reiniciar los datos de miembros

-- 2. Limpiar tokens
TRUNCATE TABLE password_reset_tokens RESTART IDENTITY;

-- 1. Limpiar pagos (preserva estructura)
TRUNCATE TABLE pagos RESTART IDENTITY;

-- 2. Limpiar membresías
TRUNCATE TABLE membresias RESTART IDENTITY;

-- 3. Limpiar member_stats si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'member_stats') THEN
    EXECUTE 'TRUNCATE TABLE member_stats RESTART IDENTITY';
  END IF;
END $$;

-- 4. Resetear profiles: mantener solo super_admin y admin, limpiar campos de miembros
UPDATE profiles
SET
  inscripcion_pagada = false,
  inscripcion_fecha = null,
  notas_admin = null,
  fecha_inscripcion = null
WHERE role = 'miembro';

-- 5. Eliminar profiles de miembros (opcional - descomentar si se quiere empezar de cero)
-- DELETE FROM profiles WHERE role = 'miembro';

-- 6. Resetear migracion para re-migrar
UPDATE migracion SET migrado = 'no';

-- Verificar resultados
SELECT 'pagos' as tabla, COUNT(*) as registros FROM pagos
UNION ALL
SELECT 'profiles miembros', COUNT(*) FROM profiles WHERE role = 'miembro'
UNION ALL
SELECT 'profiles admin', COUNT(*) FROM profiles WHERE role IN ('admin', 'super_admin')
UNION ALL
SELECT 'membresias', COUNT(*) FROM membresias
UNION ALL
SELECT 'migracion pendientes', COUNT(*) FROM migracion WHERE migrado = 'no';
