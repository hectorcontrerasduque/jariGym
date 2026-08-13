-- =============================================
-- 005: Add email column to profiles
-- =============================================

-- Add email column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Update the handle_new_user trigger to include email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre_completo, avatar_url, email, role, inscripcion_pagada)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.raw_user_meta_data->>'full_name', 'Sin nombre'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NEW.email,
    'miembro',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing profiles with email from auth.users
UPDATE profiles
SET email = au.email
FROM auth.users au
WHERE profiles.id = au.id
AND profiles.email IS NULL;
