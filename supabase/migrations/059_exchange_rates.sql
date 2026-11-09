-- 059: Tabla de tasas BCV (Bs por USD) para el metodo de pago BS.
-- Idempotente: seguro de re-ejecutar en el SQL Editor.
-- Aplicar manualmente en Supabase -> SQL Editor (convencion del repo).

create table if not exists public.exchange_rates (
  id bigint generated always as identity primary key,
  effective_at timestamptz not null,
  rate_bs numeric(14, 4) not null check (rate_bs > 0),
  source text not null default 'dolarapi',
  created_at timestamptz not null default now()
);

comment on table public.exchange_rates is
  'Historial de tasas BCV (Bs por USD). Maximo 10 registros; escritura solo desde la API con service_role.';
comment on column public.exchange_rates.effective_at is
  'Fecha y hora de vigencia de la tasa (fechaActualizacion del proveedor)';
comment on column public.exchange_rates.rate_bs is
  'Valor en bolivares por 1 USD';
comment on column public.exchange_rates.source is
  'Identificador del proveedor que origino el valor';

-- Sin duplicados: misma vigencia + mismo monto = misma fila.
create unique index if not exists uq_exchange_rates_effective_at_rate
  on public.exchange_rates (effective_at, rate_bs);

create index if not exists idx_exchange_rates_effective_at
  on public.exchange_rates (effective_at desc);

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select_authenticated" on public.exchange_rates;
create policy "exchange_rates_select_authenticated" on public.exchange_rates
  for select to authenticated using (true);

grant select on public.exchange_rates to authenticated;
grant all on public.exchange_rates to service_role;
