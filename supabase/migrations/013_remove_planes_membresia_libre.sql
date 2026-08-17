-- 013_remove_planes_membresia_libre.sql
-- Drop planes table and clean up membresia_libre from profiles

-- 1. Remove plan_id from membresias
ALTER TABLE membresias DROP COLUMN IF EXISTS plan_id;

-- 2. Add assignment tracking to membresias
ALTER TABLE membresias ADD COLUMN IF NOT EXISTS asignado_por uuid REFERENCES profiles(id);
ALTER TABLE membresias ADD COLUMN IF NOT EXISTS asignado_por_nombre text;

-- 3. Make fecha_fin nullable (null = membresia libre indefinitely)
ALTER TABLE membresias ALTER COLUMN fecha_fin DROP NOT NULL;

-- 4. Drop planes table
DROP TABLE IF EXISTS planes CASCADE;

-- 5. Remove membresia_libre from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS membresia_libre;
