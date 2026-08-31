-- Migration 047: Allow authenticated users to read profiles for distribution chart
-- Miembros need to see arrival_time/departure_time of other members for the Home tab chart

-- Add SELECT policy for authenticated users (read-only, profiles already have user-level policies)
CREATE POLICY "Authenticated users can view profiles for chart"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');
