-- 061: Color de superficie y borde para la personalizacion visual de la app.
-- Defaults = valores hardcodeados actuales del tema (app/globals.css @theme).
-- Idempotente: seguro de re-ejecutar en el SQL Editor.
-- Aplicar manualmente en Supabase -> SQL Editor (convencion del repo).

alter table public.gym_config
  add column if not exists color_superficie text default '#111827',
  add column if not exists color_borde text default '#1E293B';

comment on column public.gym_config.color_superficie is
  'Color de superficie (menu, tarjetas, modal). Default #111827';
comment on column public.gym_config.color_borde is
  'Color de marcos y bordes internos de la app. Default #1E293B';
