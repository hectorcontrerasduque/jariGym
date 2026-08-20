-- 026: Inicio - Limpiar todo y recrear estado inicial
-- ADVERTENCIA: Reset completo del sistema

-- 1. Limpiar tablas de datos
TRUNCATE TABLE pagos RESTART IDENTITY;
TRUNCATE TABLE membresias RESTART IDENTITY;
TRUNCATE TABLE password_reset_tokens RESTART IDENTITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'member_stats') THEN
    EXECUTE 'TRUNCATE TABLE member_stats RESTART IDENTITY';
  END IF;
END $$;

-- 2. Eliminar todos los auth.users y profiles
DELETE FROM auth.users;
DELETE FROM profiles;

-- 3. Limpiar gym_config y metodos de pago
DELETE FROM gym_config_metodos_pago;
DELETE FROM gym_config;

-- 4. Insertar config por defecto
INSERT INTO gym_config (nombre_gym, dueno_email, logo_url, moneda)
VALUES ('GymApp', '', NULL, '$');

-- 5. Resetear migracion para re-migrar
UPDATE migracion SET migrado = 'no';

-- Verificar
SELECT 'gym_config' as tabla, COUNT(*) as registros FROM gym_config
UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'membresias', COUNT(*) FROM membresias
UNION ALL SELECT 'migracion pendientes', COUNT(*) FROM migracion WHERE migrado = 'no';
