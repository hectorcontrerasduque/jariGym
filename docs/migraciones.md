# Migrations Applied (referencia)

001–034 applied in Supabase SQL Editor. Key ones:
- **019**: RPC functions (aprobar_pago_atomico, etc.) — **NOTE: 020 dropped these, breaking approval**
- **020**: Dropped RPC functions
- **025**: RLS for pagos suspendido + migracion (service_role only)
- **026**: Nuclear reset — TRUNCATE pagos/membresias, DELETE all users/profiles/config
- **027**: Added `registered` boolean to profiles
- **028**: Added `tipo_pago` column to pagos (membresia/inscripcion)
- **029**: Notifications system — `notificacion_config`, `notificacion_log` tables + RLS
- **030a**: Added `hora_llegada` and `hora_salida` text columns to profiles
- **030b**: Suspension workflow — `suspendido_pendiente` estado, `created_by` audit column (historical, `suspendido_pendiente` removed in `3360da2`)
- **031**: RLS DELETE policies for `suspendido_pendiente` pagos (historical)
- **032**: Added `frecuencia_diaria` boolean to `notificacion_config`
- **033**: Added `modo_cobro` text to `gym_config` ('dia_uno' | 'fecha_inscripcion')
- **034**: Admin INSERT RLS for pagos + comprobantes storage
- **035**: **Payment normalization** — renames old `pagos` → `pagos_historial`, creates new `pagos` (header) + `detalle_pago` (detail per month/inscription). `CreatePagoInput` now takes `detalles[]` instead of flat fields.
- **056**: **Remove suspendido status** — updates existing `suspendido` → `aprobado`, tightens CHECK to `('pendiente', 'aprobado', 'rechazado')`. Apply manually in Supabase SQL Editor.
- **058**: **Web Push** — `push_subscriptions` table + RLS (own rows) + `gym_config.push_enabled`. Apply manually in Supabase SQL Editor (not versioned: `.gitignore` hides `supabase/migrations/*.sql`).
