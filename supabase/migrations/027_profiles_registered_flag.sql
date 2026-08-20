-- 027: Add 'registered' flag to profiles
-- Only profiles with registered=true can log in (except admin/owner emails)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registered BOOLEAN DEFAULT false;

-- Mark existing non-trigger profiles as registered
UPDATE profiles SET registered = true WHERE role IN ('super_admin', 'admin');
UPDATE profiles SET registered = true WHERE role = 'miembro' AND fecha_inscripcion IS NOT NULL;
