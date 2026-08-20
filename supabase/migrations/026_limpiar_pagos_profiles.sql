-- 026: Limpiar tablas para re-migración
-- ADVERTENCIA: Ejecutar solo si se necesita reiniciar los datos de miembros

-- 1. Limpiar pagos
TRUNCATE TABLE pagos RESTART IDENTITY;

-- 2. Limpiar membresías
TRUNCATE TABLE membresias RESTART IDENTITY;

-- 3. Limpiar tokens
TRUNCATE TABLE password_reset_tokens RESTART IDENTITY;

-- 4. Limpiar member_stats si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'member_stats') THEN
    EXECUTE 'TRUNCATE TABLE member_stats RESTART IDENTITY';
  END IF;
END $$;

-- 5. Eliminar todos los auth.users
DELETE FROM auth.users;

-- 6. Eliminar todos los profiles
DELETE FROM profiles;

-- 7. Resetear migracion para re-migrar
UPDATE migracion SET migrado = 'no';

-- Verificar resultados
SELECT 'pagos' as tabla, COUNT(*) as registros FROM pagos
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL
SELECT 'membresias', COUNT(*) FROM membresias
UNION ALL
SELECT 'migracion pendientes', COUNT(*) FROM migracion WHERE migrado = 'no';
