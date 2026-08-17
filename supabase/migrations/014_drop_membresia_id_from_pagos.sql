-- 014_drop_membresia_id_from_pagos.sql
-- Remove membresia_id from pagos table (no longer needed)

ALTER TABLE pagos DROP COLUMN IF EXISTS membresia_id;
