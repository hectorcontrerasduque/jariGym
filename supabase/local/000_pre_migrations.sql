-- LOCAL DEV ONLY. Applied BEFORE supabase/migrations/*.sql.
-- Tables that exist in the real database but were never created by a committed
-- migration (migrations 025, 026 and 039 reference them). Reconstructed from code usage.

-- Legacy members imported from Excel (app/api/migracion/*, lib/features/pagos/service.ts getMigradosConDeuda)
CREATE TABLE IF NOT EXISTS public.migracion (
  id bigserial PRIMARY KEY,
  nombre text NOT NULL,
  correo text,
  mes_pagar integer,
  anio_pagar integer,
  estado text,               -- 'pagado' | 'suspendido' | 'debe'
  migrado text DEFAULT 'no', -- 'no' | 'si' | 'migrado'
  created_at timestamptz DEFAULT now()
);
