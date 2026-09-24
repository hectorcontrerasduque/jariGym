# Proposal

## Why

El dashboard (`app/dashboard/page.tsx:143-220`) hace la carga más pesada de la app, y la hace desde el teléfono del usuario:

- **El RPC `get_pagos_por_anio` se descarga 3 veces por carga con el mismo año**: `stats()` lo llama (`lib/features/pagos/service.ts`, método `stats`), `stats()` llama a `getMiembrosMorosos()`, que lo vuelve a llamar, y `monthlyStats()` lo llama una tercera vez. Es la respuesta más grande (una fila por línea de detalle de todos los pagos del año).
- **Cadena de 4 saltos secuenciales de red**: `getUser` → ronda 1 (perfil + elegibles) → ronda 2 (stats, monthlyStats, recientes, años, config) → dentro de la ronda 2, `pagosRecientesAprobados` hace `getUser` y luego su consulta. La ronda 2 espera a la 1 solo porque `stats`/`monthlyStats` necesitan `elegibles`; recientes, años y config no dependen de nada.

El roadmap preveía mover los agregados a Postgres. Se descarta en esta fase: exigiría aplicar una migración manual en producción **antes** del deploy (si se despliega sin ella, el dashboard se rompe) y, con un tope de 80 miembros (`gym_config.max_members`), el costo está en los viajes repetidos, no en el cálculo.

## What Changes

- Nuevo método `PagosService.cargarDashboard(anio, supabaseClient?)`: obtiene `elegibles` y el RPC del año **en paralelo, una sola vez**, y calcula `stats`, `monthlyStats` y morosos con las funciones puras de `lib/features/pagos/domain` usando un único `hoy`. Devuelve `{ elegibles, stats, monthlyStats }`.
- `app/dashboard/page.tsx` (`loadData`): una sola ronda paralela con perfil, `cargarDashboard`, recientes, años y config. La consulta de pagos pendientes propios (solo no-admin) sigue ejecutándose después, porque depende del rol.
- Resultado esperado por carga del dashboard (admin): RPC del año 3 → 1; peticiones 13 → 11; saltos secuenciales 4 → 3.

## Non-goals

- No cambian los números, textos ni el orden de lo que muestra el dashboard: `cargarDashboard` produce exactamente lo mismo que `stats()` + `monthlyStats()` para los mismos datos (se verifica con un test de equivalencia).
- No se modifican `stats()`, `monthlyStats()`, `getMiembrosMorosos()` ni sus firmas: los usan otras pantallas y las rutas de notificaciones.
- No se tocan los modales del dashboard (deudores, al día, libres): siguen consultando al abrirse, con datos frescos.
- Sin migraciones SQL ni cambios en RLS: la fase se puede desplegar sin tocar la base de datos.
- Sin cambios en la experiencia de carga (el loader a pantalla completa se mantiene); eso es la fase `server-first-pages`.

## Capabilities

### New Capabilities
<!-- Ninguna: optimización interna sin cambios de comportamiento (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- `lib/features/pagos/service.ts`: nuevo método `cargarDashboard`.
- `app/dashboard/page.tsx`: función `loadData`.
- Tests: equivalencia `cargarDashboard` ≡ `stats` + `monthlyStats`; conteo de llamadas (1 RPC).
- Única diferencia teórica: si la carga cruza la medianoche, hoy `stats`, morosos y `monthlyStats` podían usar fechas distintas; con un único `hoy` son coherentes entre sí.
