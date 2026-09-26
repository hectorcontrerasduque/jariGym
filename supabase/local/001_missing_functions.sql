-- LOCAL DEV ONLY. Functions the app calls that exist in the real database but whose
-- migrations were never committed (supabase/migrations/*.sql is gitignored; see ROADMAP).
-- Reconstructed from how the code uses them. Replace with the real definitions
-- from a schema dump when available.

-- Used by lib/features/pagos/service.ts (getPagosPorAnio): one row per payment
-- detail line of the given year, joined with its payment header.
CREATE OR REPLACE FUNCTION public.get_pagos_por_anio(p_anio integer)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  status text,
  payment_note text,
  payment_method text,
  bill_code text,
  receipt_url text,
  created_at timestamptz,
  month_number integer,
  year_number integer,
  payment_amount numeric,
  payment_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT p.id, p.user_id, p.status::text, p.payment_note, p.payment_method::text, p.bill_code,
         p.receipt_url, p.created_at, d.month_number, d.year_number, d.payment_amount, d.payment_type::text
  FROM public.payments p
  JOIN public.payment_detail d ON d.payment_id = p.id
  WHERE d.year_number = p_anio;
$$;

GRANT EXECUTE ON FUNCTION public.get_pagos_por_anio(integer) TO authenticated, service_role;
