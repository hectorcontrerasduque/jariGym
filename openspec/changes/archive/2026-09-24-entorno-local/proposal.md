# Proposal

## Why

No había forma de probar la app ni medir su rendimiento sin usar los proyectos de Supabase en la nube. Además, el repo no alcanza para reconstruir la base: `.gitignore` ignora `supabase/migrations/*.sql` (línea 31), así que las migraciones 051–054 y 056 nunca se versionaron. La función `get_pagos_por_anio`, que usa el dashboard (commit `404c46b`: "migración 053 … no versionada"), y la tabla `migracion` solo existen en la base real.

## What Changes

- Supabase local con Docker (`supabase/config.toml`, CLI como devDependency `supabase`): sin analytics ni edge runtime, para que quepa en 8 GB de RAM.
- `scripts/db-local.mjs` (`npm run db:local:start | reset | stop`), en Node para que funcione igual en macOS y en Windows PowerShell. `reset` hace: base vacía → `supabase/local/000_*.sql` → `supabase/migrations/*.sql` → `supabase/local/001_*.sql` → seed → `.env.development.local`.
- `supabase/local/`: reconstrucción documentada de lo que falta en el repo (tabla `migracion`, función `get_pagos_por_anio`).
- Seed determinista: admin/dueño, miembro demo y 78 socios (80 en total, el tope del gym), unos 800 pagos del año pasado y del actual (al día, atrasados, pendientes, rechazados, suspensiones, libres, inactivos) y 6 personas de migración.
- `scripts/bench-dashboard.mjs`: benchmark con Playwright que simula la red de un teléfono (150 ms de latencia, 4 Mbps), mide el tiempo hasta ver datos, las peticiones y los KB, y guarda el texto visible del dashboard para comparar dos versiones.

## Non-goals

- No cambia código de la aplicación ni la base real. Nada se conecta a la nube.
- No arregla el `.gitignore` de migraciones: cambia el flujo del equipo y requiere decisión (ver ROADMAP).
- El esquema local es una aproximación hasta tener un dump real del esquema (`supabase db dump`).

## Capabilities

### New Capabilities
<!-- Ninguna: tooling de desarrollo (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- Nuevos: `supabase/config.toml`, `supabase/.gitignore`, `supabase/local/*.sql`, `scripts/db-local.mjs`, `scripts/bench-dashboard.mjs`.
- `package.json`: devDependency `supabase` y scripts `db:local:*`.
- `.gitignore`: `bench-out/`.
- `AGENTS.md`: sección "Local database".
