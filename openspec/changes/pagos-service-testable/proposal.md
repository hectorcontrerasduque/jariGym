# Proposal

## Why

`PagosService` concentra el cálculo de deudas, estadísticas del dashboard y el ciclo de vida de los pagos (creación, aprobación, rechazo, suspensión), pero no se puede probar de forma aislada: crea un cliente Supabase de navegador en un campo de instancia (`lib/services/pagos/pagos.service.ts:64`, `private supabase = createClient()`) y la instancia se construye al importar el módulo (`pagos.service.ts:1017`, `export const pagosService = new PagosService()`). Solo los métodos de lectura aceptan un cliente alternativo; las escrituras (`crearPago`, `aprobarPago`, `rechazarPago`, `crearPagoAprobado`, `crearPagoSuspendido`) siempre usan el cliente interno.

Resultado: la lógica de dinero no tiene red de seguridad. `__tests__/pagos.test.ts` tiene 32 tests pero no importa `PagosService`; solo `__tests__/morosos.test.ts` ejercita código real (`getMiembrosMorosos`) mockeando el módulo `@/lib/supabase/client`. Las siguientes fases del refactor (transacciones atómicas, RPC de estadísticas, unificar notificaciones) tocan exactamente este código, así que primero hay que fijar su comportamiento actual con tests.

## What Changes

- `PagosService` acepta un cliente Supabase opcional en el constructor. Sin argumento conserva el comportamiento actual (cliente de navegador). El cliente por defecto se crea de forma perezosa en el primer uso en vez de al importar el módulo.
- Se mantienen **sin cambios** la instancia exportada `pagosService`, todas las firmas públicas (incluido el parámetro opcional `supabaseClient` de los métodos de lectura), los tipos exportados y los alias `DetallePagoInput`/`CreatePagoInput`.
- Nuevo helper de test: un cliente Supabase falso y programable (`__tests__/helpers/supabase-fake.ts`) que registra las llamadas (`from`, `select`, `eq`, `insert`, `update`, `delete`, `rpc`, `auth.getUser`) y devuelve respuestas configuradas por tabla/operación.
- Tests de caracterización nuevos que fijan el comportamiento actual de: `stats`, `monthlyStats`, `getMiembrosMorosos`, `getMiembrosAlDia`, `getMiembrosElegibles`, `mesesPendientes`, `crearPago`, `crearPagoAprobado`, `aprobarPago`, `rechazarPago`, `crearPagoSuspendido`.
- `__tests__/morosos.test.ts` pasa a usar inyección por constructor en lugar de `vi.mock` del módulo (mismos casos, mismas aserciones).
- Se elimina de `__tests__/pagos.test.ts` solo lo que es redundante con los tests nuevos; los casos existentes que prueban `utils` se conservan.

## Non-goals

No cambia ningún comportamiento observable:

- Mismos resultados de `stats`, `monthlyStats`, morosos, meses pendientes y "al día" para los mismos datos.
- Mismos mensajes de error (`messages.toast.*` y el texto literal "No tienes permiso para registrar este pago").
- Mismas consultas a Supabase en el mismo orden (misma cantidad de llamadas de red); la optimización de consultas es la fase `dashboard-stats-rpc`.
- Se mantiene la creación de pagos en dos pasos con borrado compensatorio; hacerla atómica es la fase `pagos-transacciones-atomicas`.
- Se conservan tal cual estas particularidades observadas, que se documentan en los specs y se dejan para decisión posterior:
  - `aniosConPagos(usuarioId)` filtra por `payments.user_id` sin hacer join a `payments` (`pagos.service.ts:512`).
  - `tieneInscripcionPendiente` solo revisa el primer pago encontrado (`pagos.service.ts:449-464`).
  - `crearPagoSuspendido` devuelve `0` en lugar de lanzar error cuando falla el insert (`pagos.service.ts:340`, `:352`).
  - `stats`, `monthlyStats` y `getMiembrosMorosos` llaman cada uno a `get_pagos_por_anio` (el dashboard la ejecuta dos veces para el mismo año).
- No se modifica ninguna página, ruta API, migración SQL ni política RLS.

## Capabilities

### New Capabilities
- `pagos`: comportamiento actual del servicio de pagos — cálculo de miembros elegibles, morosos, meses pendientes, miembros al día, estadísticas anuales y mensuales, y ciclo de vida de un pago (crear, crear aprobado, aprobar, rechazar, suspender). Documenta lo existente; no añade reglas de negocio.

### Modified Capabilities
<!-- Ninguna: no existen specs previas en openspec/specs/. -->

## Impact

- **Código**: `lib/services/pagos/pagos.service.ts` (solo constructor y creación del cliente por defecto).
- **Tests**: nuevo `__tests__/helpers/supabase-fake.ts`, nuevo `__tests__/pagos.service.test.ts`, refactor de `__tests__/morosos.test.ts`, limpieza de `__tests__/pagos.test.ts`.
- **Llamadores** (sin cambios requeridos): `app/dashboard/page.tsx`, `app/dashboard/pagos/page.tsx`, `app/dashboard/mis-pagos/page.tsx`, `app/dashboard/reportar-pago/page.tsx`, `app/api/notificaciones/route.ts`, `app/api/notificaciones/procesar/route.ts`.
- **Dependencias**: ninguna nueva.
- **Habilita**: las fases `pagos-transacciones-atomicas`, `dashboard-stats-rpc` y `notificaciones-unificar`, que modificarán este servicio con los tests ya en su lugar.
