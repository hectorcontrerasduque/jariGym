-- 026: Inicio - Limpiar todo el sistema
-- ADVERTENCIA: Reset completo

-- 1. Limpiar tablas de datos (orden: hijos primero, luego padres)
TRUNCATE TABLE detalle_pago, pagos, membresias, password_reset_tokens, notificacion_log, notificacion_config RESTART IDENTITY CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'member_stats') THEN
    EXECUTE 'TRUNCATE TABLE member_stats RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- 2. Eliminar todos los auth.users y profiles
DELETE FROM auth.users;
DELETE FROM profiles;

-- 3. Limpiar config y metodos de pago
DELETE FROM gym_config_payment_methods;
DELETE FROM gym_config;

-- 4. Resetear migracion para re-migrar
UPDATE migracion SET migrado = 'no';

-- Verificar
SELECT 'gym_config' as tabla, COUNT(*) as registros FROM gym_config
UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'membresias', COUNT(*) FROM membresias
UNION ALL SELECT 'notificacion_config', COUNT(*) FROM notificacion_config
UNION ALL SELECT 'notificacion_log', COUNT(*) FROM notificacion_log
UNION ALL SELECT 'migracion pendientes', COUNT(*) FROM migracion WHERE migrado = 'no';
