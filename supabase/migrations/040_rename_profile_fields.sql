-- 040: Rename profile fields
-- fecha_inscripcion → fecha_inicio (confusion with inscription payment date)
-- notas_admin → inscripcion_nota_admin

ALTER TABLE profiles RENAME COLUMN fecha_inscripcion TO fecha_inicio;
ALTER TABLE profiles RENAME COLUMN notas_admin TO inscripcion_nota_admin;
