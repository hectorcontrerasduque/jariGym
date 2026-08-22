-- 026: Inicio - Limpiar todo el sistema
-- ADVERTENCIA: Reset completo

-- 1. Limpiar tablas de datos
TRUNCATE TABLE pagos RESTART IDENTITY;
TRUNCATE TABLE membresias RESTART IDENTITY;
TRUNCATE TABLE password_reset_tokens RESTART IDENTITY;
TRUNCATE TABLE notificacion_config RESTART IDENTITY;
TRUNCATE TABLE notificacion_log RESTART IDENTITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'member_stats') THEN
    EXECUTE 'TRUNCATE TABLE member_stats RESTART IDENTITY';
  END IF;
END $$;

-- 2. Eliminar todos los auth.users y profiles
DELETE FROM auth.users;
DELETE FROM profiles;

-- 3. Limpiar config y metodos de pago
DELETE FROM gym_config_metodos_pago;
DELETE FROM gym_config;

-- 4. Resetear migracion para re-migrar
UPDATE migracion SET migrado = 'no',whatsapp = null, correo=null;

-- Verificar
SELECT 'gym_config' as tabla, COUNT(*) as registros FROM gym_config
UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'membresias', COUNT(*) FROM membresias
UNION ALL SELECT 'notificacion_config', COUNT(*) FROM notificacion_config
UNION ALL SELECT 'notificacion_log', COUNT(*) FROM notificacion_log
UNION ALL SELECT 'migracion pendientes', COUNT(*) FROM migracion WHERE migrado = 'no';
