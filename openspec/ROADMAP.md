# Roadmap del refactor (rama `refactor/arquitectura-calidad`)

Regla: refactor sin cambios de comportamiento (ver `openspec/config.yaml`).
Cada fase es un change de OpenSpec en `openspec/changes/<nombre>/`; se propone cuando la anterior está aplicada, para diseñarla sobre el código real.

## Arquitectura objetivo: módulos por feature con núcleo puro

```
lib/features/<feature>/
  domain/      funciones puras (sin Supabase, sin reloj global: reciben "hoy")
  data/        consultas Supabase; reciben el cliente como parámetro
  service.ts   orquesta data → domain
app/           páginas y rutas API: solo delegan a lib/features/*
supabase/      transacciones e invariantes en RPC plpgsql + RLS
```

1. Lógica de negocio pura y testeable en milisegundos.
2. Acceso a datos con el cliente inyectado: se acaba la trampa del cliente de navegador en el servidor.
3. Atomicidad y agregados pesados en Postgres.
4. Carga de datos en el servidor (Server Components) — fase 7, opcional.
5. Pirámide de tests: unit (domain) › integración (data/RLS contra Supabase local) › pocos E2E.
6. Controles de calidad: pre-commit, pre-push, CI.

## Fases

| # | Change | Estado | Objetivo |
|---|--------|--------|----------|
| 0 | — | ✅ hecho | Tests corriendo en local (207/207), OpenSpec instalado |
| 0.6 | `entorno-local` | ✅ archivado | Supabase local + seed de 80 miembros + benchmark del dashboard |
| 0.5 | `quality-gates` | ✅ archivado | husky + lint-staged: pre-commit (eslint, tsc, vitest), pre-push (build) |
| 1 | `pagos-service-testable` | ✅ archivado | Cliente inyectado + tests de caracterización + `lib/features/pagos/domain` |
| 2 | `pagos-transacciones-atomicas` | ⏳ pendiente | Crear/aprobar pago en una sola transacción (RPC plpgsql); consultas a `data/` |
| 3 | `notificaciones-unificar` | ⏳ pendiente | Una sola implementación de los 4 tipos (hoy duplicados en `api/notificaciones/route.ts` y `procesar/route.ts`) |
| 4 | `dashboard-carga-unica` | ✅ archivado | Dashboard en una ronda paralela y 1 descarga del RPC del año (antes 3). Sin migraciones SQL |
| 5 | `rls-tests` | ⏳ pendiente | Tests de políticas RLS contra Supabase local |
| 6 | `ci-minimo` | ⏳ pendiente | Lint + typecheck + tests automáticos en GitHub |
| 7 | `server-first-dashboard` | 🔨 en curso | Dashboard como Server Component: consultas iniciadas en el servidor, cálculos en el navegador (hora local). Mismo loader |
| 8 | `api-docs` | ⏳ pendiente | Documentar los 20 endpoints en `docs/api/openapi.yaml` + test que falla si un `route.ts` no está documentado |

Orden de ejecución acordado: 1 → 4 → 7 → 8, luego 2, 3, 5, 6.

Fase 4 original ("agregados del dashboard en Postgres") descartada: exigía aplicar una migración a mano en producción antes del deploy y, con un tope de 80 miembros, el costo real eran los viajes repetidos, no el cálculo.

## Resultados por fase

**0.5 `quality-gates`** — pre-commit ~4 s (eslint staged, tsc, vitest), pre-push `next build`. Verificado que bloquea lint, tipos y tests rotos.

**1 `pagos-service-testable`** — Spec `openspec/specs/pagos/spec.md` (10 requisitos, comportamiento vigente).
- Tests: 207 → 296. 60 de caracterización (escritos contra el código sin tocar, verificados con mutaciones), 22 de dominio puro, 3 de inyección, 5 del doble de Supabase.
- `lib/services/pagos/pagos.service.ts` (1022 líneas) → `lib/features/pagos/service.ts` (703) + `domain/` puro.
- `next build` ya no falla en `pagos.service` por falta de variables de entorno.

**4 `dashboard-carga-unica`** — Carga del dashboard (admin), contada por código y verificada con tests:

| | Antes | Después |
|---|---|---|
| Descargas de `get_pagos_por_anio` (todos los pagos del año) | 3 | **1** |
| Peticiones de red | 13 | **11** |
| Saltos secuenciales teléfono ↔ Supabase | 4 | **3** |

Sin migraciones SQL. Equivalencia demostrada en 5 escenarios (`__tests__/dashboard-carga.test.ts`, verificado con mutaciones).

**Medición real** (`scripts/bench-dashboard.mjs`, builds de producción, base local con seed de 80 miembros, red de teléfono simulada con 150 ms de latencia y 4 Mbps, mediana de 2×7 cargas):

| | Rama `dev` (antes) | Fase 4 |
|---|---|---|
| Hasta ver los datos | ~1950 ms | **~1005 ms (−48 %)** |
| KB descargados de Supabase | 532 | **218 (−59 %)** |
| Peticiones a Supabase (toda la página) | 15 | 13 |
| Texto visible del dashboard | — | idéntico |

## Pendientes detectados que no cambian comportamiento

- `AuthService` (`lib/services/auth/auth.service.ts:6`) y `lib/services/supabase-browser.ts` crean el cliente de navegador al importar; sin variables de entorno el prerender de `/login` y `/dashboard` falla. Mismo arreglo que `PagosService`; se incluye en la fase 7.

## Riesgo de proceso detectado

- **`.gitignore` ignora `supabase/migrations/*.sql`**: toda migración nueva queda fuera de Git. Las 051–054 y 056 (incluida la que define `get_pagos_por_anio`) solo existen en la base real. Recomendación: quitar esa regla y versionar las migraciones que faltan, a partir de un `supabase db dump` del esquema real. Requiere decisión del equipo.

## Hallazgos que **no** se tocan en este refactor porque cambiarían el comportamiento (requieren decisión explícita y su propio change):
- `aniosConPagos(usuarioId)` filtra por `payments.user_id` sin join.
- `tieneInscripcionPendiente` solo revisa el primer pago encontrado.
- `crearPagoSuspendido` devuelve `0` en vez de lanzar error.
- El rate limit deja pasar el request si falla el RPC (`lib/middleware/rate-limit.ts`).
- Envío de correos de notificación en serie: pasarlo a paralelo cambia el ritmo de envío a Gmail y se evaluará en la fase 3.
