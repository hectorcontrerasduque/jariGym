-- =============================================
-- 007: Ensure inscripcion_pagada defaults to false
-- =============================================

ALTER TABLE profiles ALTER COLUMN inscripcion_pagada SET DEFAULT false;

UPDATE profiles SET inscripcion_pagada = false WHERE inscripcion_pagada IS NULL;
