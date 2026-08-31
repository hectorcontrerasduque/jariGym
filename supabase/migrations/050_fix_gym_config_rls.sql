-- =============================================
-- 050: Restaurar acceso público de lectura a gym_config
-- =============================================
-- Descripción:
--   La política RLS de gym_config fue restringida a authenticated users
--   en migraciones anteriores (042/046). Esto impide que la página de
--   login muestre el nombre y logo del gym (ya que el usuario no está
--   autenticado aún). Se restaura el acceso público de solo lectura
--   que existía en las migraciones 001-024.
--
--   La tabla gym_config solo contiene datos de display del gym
--   (nombre, logo, dirección, etc.) — no es información sensible.
-- =============================================

-- Eliminar política restrictiva anterior
DROP POLICY IF EXISTS "Authenticated users can read gym config" ON gym_config;
DROP POLICY IF EXISTS "Super admins can read gym config" ON gym_config;

-- Restaurar acceso público de solo lectura
CREATE POLICY "Anyone can read gym config"
  ON gym_config FOR SELECT
  USING (true);
