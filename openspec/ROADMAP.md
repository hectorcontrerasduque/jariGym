# Roadmap del refactor (rama `refactor/arquitectura-calidad`)

Regla: refactor sin cambios de comportamiento (ver `openspec/config.yaml`).
Cada fase es un change de OpenSpec en `openspec/changes/<nombre>/`; se propone cuando la anterior está aplicada, para diseñarla sobre el código real.

| # | Change | Estado | Objetivo |
|---|--------|--------|----------|
| 0 | — | ✅ hecho | Tests corriendo en local (207/207), OpenSpec instalado |
| 1 | `pagos-service-testable` | 📝 propuesto | Inyección del cliente Supabase en `PagosService` + tests de caracterización |
| 2 | `pagos-transacciones-atomicas` | ⏳ pendiente | Crear/aprobar pago en una sola transacción (RPC plpgsql) |
| 3 | `notificaciones-unificar` | ⏳ pendiente | Una sola implementación de los 4 tipos (hoy duplicados en `api/notificaciones/route.ts` y `procesar/route.ts`) |
| 4 | `dashboard-stats-rpc` | ⏳ pendiente | Agregados del dashboard en Postgres; eliminar la doble llamada a `get_pagos_por_anio` |
| 5 | `rls-tests` | ⏳ pendiente | Tests de políticas RLS contra Supabase local |
| 6 | `ci-minimo` | ⏳ pendiente | Lint + typecheck + tests automáticos |

Hallazgos que **no** se tocan en este refactor porque cambiarían el comportamiento (requieren decisión explícita y su propio change):
- `aniosConPagos(usuarioId)` filtra por `payments.user_id` sin join.
- `tieneInscripcionPendiente` solo revisa el primer pago encontrado.
- `crearPagoSuspendido` devuelve `0` en vez de lanzar error.
- El rate limit deja pasar el request si falla el RPC (`lib/middleware/rate-limit.ts`).
- Envío de correos de notificación en serie: pasarlo a paralelo cambia el ritmo de envío a Gmail y se evaluará en la fase 3.
