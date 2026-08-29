-- 039: Add index on migracion.nombre for faster autocomplete search
CREATE INDEX IF NOT EXISTS idx_migracion_nombre ON migracion(nombre);
