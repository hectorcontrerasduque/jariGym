-- 062: Tabla payment_bolivares — datos del pago en bolívares (monto BS, tasa BCV,
--       banco, referencia, imagen del comprobante) ligado 1:1 con payment_detail
--       (solo pagos con payment_method='bs').
--
-- Reglas de integridad:
--   * payment_id → payments(id) ON DELETE CASCADE (borrar pago borra hijas).
--   * payment_detail_id UNIQUE → payment_detail(id): cada detalle de pago BS tiene
--     exactamente una fila aquí. NO se repiten month_number/year_number/payment_type
--     (viven en payment_detail).
--   * rate_bcv NO es FK a exchange_rates: se guarda el snapshot de la última tasa
--     vigente al momento de crear el pago (último registro con effective_at <= now()).
--   * amount_usd = amount_bs / rate_bcv (calculado al crear; payment_detail.payment_amount
--     para pagos BS siempre guarda el USD equivalente = amount_usd).
--   * reconciled=true solo indica que el super admin concilió el dato del pago BS;
--     NO implica que el payment esté aprobado (la aprobación depende de que la suma
--     de amount_usd por mes/año/tipo cubra el monto mensual configurado).
--
-- Idempotente: seguro de re-ejecutar en el SQL Editor.
-- Aplicar manualmente en Supabase -> SQL Editor (convención del repo).

create table if not exists public.payment_bolivares (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  payment_detail_id uuid unique references public.payment_detail(id) on delete cascade,
  amount_bs numeric(14, 2) not null check (amount_bs > 0),
  rate_bcv numeric(14, 4) not null check (rate_bcv > 0),
  amount_usd numeric(14, 2) not null check (amount_usd >= 0),
  bank text,
  reference_number text,
  reconciled boolean not null default false,
  paid_at timestamptz,
  image_url text,
  image_filename text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.payment_bolivares is
  'Datos del pago en bolívares (1:1 con payment_detail de pagos BS). rate_bcv es snapshot de exchange_rates vigente al crear.';
comment on column public.payment_bolivares.rate_bcv is
  'Tasa BCV (Bs por USD) vigente al momento de crear el pago — snapshot, no FK.';
comment on column public.payment_bolivares.amount_usd is
  'Monto equivalente en USD = amount_bs / rate_bcv. Igual a payment_detail.payment_amount.';
comment on column public.payment_bolivares.reconciled is
  'true cuando el super admin concilió el dato. NO implica payment aprobado.';
comment on column public.payment_bolivares.image_url is
  'Ruta en el bucket comprobantes: payments/<payment_id>/comprobante.<ext>. Borrada al aprobar.';

create index if not exists idx_payment_bolivares_payment_id
  on public.payment_bolivares (payment_id);

create index if not exists idx_payment_bolivares_reconciled
  on public.payment_bolivares (reconciled) where not reconciled;

alter table public.payment_bolivares enable row level security;

drop policy if exists "payment_bolivares_select_authenticated" on public.payment_bolivares;
create policy "payment_bolivares_select_authenticated" on public.payment_bolivares
  for select to authenticated using (true);

-- INSERT: el miembro dueño del pago (via payments.user_id) o un super_admin.
-- Usa get_user_role() (SECURITY DEFINER) para no recursar contra profiles.
drop policy if exists "payment_bolivares_insert" on public.payment_bolivares;
create policy "payment_bolivares_insert" on public.payment_bolivares
  for insert to authenticated
  with check (
    get_user_role() = 'super_admin'
    or exists (
      select 1 from public.payments p
      where p.id = payment_id and p.user_id = auth.uid()
    )
  );

-- UPDATE (conciliación): solo super_admin marca reconciled / edita datos BS.
drop policy if exists "payment_bolivares_update_super_admin" on public.payment_bolivares;
create policy "payment_bolivares_update_super_admin" on public.payment_bolivares
  for update to authenticated
  using (get_user_role() = 'super_admin')
  with check (get_user_role() = 'super_admin');

grant select, insert, update on public.payment_bolivares to authenticated;
grant all on public.payment_bolivares to service_role;

-- Storage: el miembro sube su comprobante BS bajo payments/<payment_id>/.
-- (El bucket comprobantes ya permite uploads autenticados; esta policy deja explícito
--  el prefijo payments/ para el flujo 062. Se aplica en SQL Editor junto a la tabla.)
drop policy if exists "comprobantes_upload_payments" on storage.objects;
create policy "comprobantes_upload_payments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = 'payments'
  );
