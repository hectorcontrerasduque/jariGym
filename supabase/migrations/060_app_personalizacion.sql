-- 060: Personalizacion visual de la app por gimnasio (colores + fuente).
-- Valores por defecto = los colores hardcodeados actuales del tema (app/globals.css).
-- Idempotente: seguro de re-ejecutar en el SQL Editor.
-- Aplicar manualmente en Supabase -> SQL Editor (convencion del repo).

alter table public.gym_config
  add column if not exists color_primario text default '#38BDF8',
  add column if not exists color_secundario text default '#818CF8',
  add column if not exists color_fondo text default '#0B1120',
  add column if not exists color_fuente text default '#F8FAFC',
  add column if not exists font_family text;

comment on column public.gym_config.color_primario is
  'Color primario de la app (botones, acentos). Default #38BDF8';
comment on column public.gym_config.color_secundario is
  'Color secundario de la app (acento alternativo). Default #818CF8';
comment on column public.gym_config.color_fondo is
  'Color de fondo de la app. Default #0B1120';
comment on column public.gym_config.color_fuente is
  'Color de fuente (texto) de la app. Default #F8FAFC';
comment on column public.gym_config.font_family is
  'Familia tipografica CSS de la app. Default system-ui, -apple-system, sans-serif';
