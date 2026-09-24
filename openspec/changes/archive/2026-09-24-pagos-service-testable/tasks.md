# Tasks

Cada tarea se considera terminada solo si `npm run test`, `npx tsc --noEmit` y `npm run lint` terminan en verde.

## 1. Doble de prueba del cliente Supabase

- [x] 1.1 Crear `__tests__/helpers/supabase-fake.ts` con `createSupabaseFake()` (query builder encadenable y thenable, respuestas FIFO por tabla/operación, `rpc`, `auth.getUser`, registro `calls`), según design D2. Verificar con `__tests__/helpers/supabase-fake.test.ts`: encadenamiento, orden FIFO, respuesta por defecto `{ data: null, error: null }` y registro de filtros.

## 2. Tests de caracterización sobre el código actual (sin tocar el servicio)

- [x] 2.1 Crear `__tests__/pagos.service.test.ts` con `vi.mock("@/lib/supabase/client")` devolviendo el cliente falso, y cubrir el requirement "Miembros elegibles para cobro" (4 escenarios). Verificar que pasan contra `pagos.service.ts` sin modificar (`git diff --stat lib/` vacío).
- [x] 2.2 Cubrir "Cálculo de miembros morosos": los 6 escenarios del spec más los casos límite de `fechaInicioMap` (membresía futura con y sin `start_date`) y el año anterior (mes tope = 12). Verificar que pasan sin modificar el servicio.
- [x] 2.3 Cubrir "Miembros al día" y "Estadísticas anuales del dashboard", incluido que `stats` consulta `get_pagos_por_anio` para el año pedido. Verificar que pasan sin modificar el servicio.
- [x] 2.4 Cubrir "Estadísticas mensuales del dashboard" (mes tope, filtro por fecha de inicio, usuario con aprobado y pendiente, `montoAcumulado` incluye a no miembros). Verificar que pasan sin modificar el servicio.
- [x] 2.5 Cubrir "Meses pendientes de un miembro" (meses futuros, pendiente bloquea el mes, inicio en año posterior, error de consulta → `[]`). Verificar que pasan sin modificar el servicio.
- [x] 2.6 Cubrir "Registrar un pago" y "Registrar un pago ya aprobado": sin sesión, RLS, falla del detalle con borrado compensatorio (verificar vía `calls` el `delete` sobre `payments` con el id), efectivo sin comprobante, rol no autorizado, inscripción que actualiza el perfil. Verificar que pasan sin modificar el servicio.
- [x] 2.7 Cubrir "Aprobar y rechazar pagos" y "Solicitar suspensión de meses", incluido el filtro `status = pendiente` en el rechazo, la nota por defecto, que aprobar no filtra por estado, la actualización de pendientes existentes y el retorno `0` ante error. Verificar que pasan sin modificar el servicio.
- [x] 2.8 Commit "test: characterization tests for PagosService" con la suite completa en verde.

## 3. Inyección de dependencias en PagosService

- [x] 3.1 Aplicar design D1 en `lib/services/pagos/pagos.service.ts`: constructor con cliente opcional y getter perezoso `supabase`. Sin otros cambios en el archivo. Verificar que todos los tests de la sección 2 pasan sin modificarlos.
- [x] 3.2 Añadir tests: `new PagosService(fake)` usa el cliente inyectado en escrituras y lecturas; `new PagosService()` no llama a `createClient` hasta el primer uso; el parámetro `supabaseClient` sigue teniendo prioridad sobre el del constructor en los métodos de lectura. Verificar con `npm run test`.
- [x] 3.3 Verificar que `next build` ya no falla por falta de variables de Supabase al recolectar `api/notificaciones/procesar` (con `NEXT_PUBLIC_SUPABASE_*` vacías, el error de `createBrowserClient` en import no aparece en el log). — Resultado: `pagos.service.ts` ya no aparece; el build avanza hasta el prerender, donde falla por el mismo patrón en `AuthService` (`lib/services/auth/auth.service.ts:6`), fuera de este change (anotado en ROADMAP).

## 4. Núcleo de dominio puro (design D5)

- [x] 4.1 Crear `lib/features/pagos/domain/` y extraer `filtrarElegibles` y `calcularMesesPendientes`; `PagosService` las llama con los mismos datos. Añadir `__tests__/pagos.domain.test.ts` con los escenarios del spec para ambas y verificar que la sección 2 sigue en verde sin modificarse.
- [x] 4.2 Extraer `calcularMorosos` y `calcularMiembrosAlDia` (con `hoy` como parámetro). Tests unitarios con los escenarios del spec; sección 2 en verde sin modificarse.
- [x] 4.3 Extraer `calcularStats` y `calcularMonthlyStats`. Tests unitarios con los escenarios del spec; sección 2 en verde sin modificarse.
- [x] 4.4 Verificar que `domain/` no importa Supabase, `next/*` ni llama a `new Date()` sin argumentos (`grep -rnE "supabase|next/|new Date\(\)" lib/features/pagos/domain` sin resultados).

## 5. Mover a `lib/features/pagos/` (design D6)

- [x] 5.1 `git mv lib/services/pagos/pagos.service.ts lib/features/pagos/service.ts` y actualizar los imports en los 6 llamadores y en los tests. Verificar con `npx tsc --noEmit`, `npm run test` y `grep -rn "services/pagos" app lib components __tests__` sin resultados.
- [x] 5.2 Actualizar el comentario de la clase para documentar la inyección por constructor, manteniendo la advertencia de uso en servidor.

## 6. Migrar los tests a inyección por constructor

- [x] 6.1 Cambiar `__tests__/pagos.service.test.ts` para construir `new PagosService(fake.client)` y eliminar su `vi.mock`. Las aserciones no cambian. Verificar con `npm run test`.
- [x] 6.2 Cambiar `__tests__/morosos.test.ts` al mismo patrón (mismos 31 casos, mismas aserciones). Verificar que la cantidad de tests no baja.
- [x] 6.3 Revisar `__tests__/pagos.test.ts`: eliminar solo los casos que únicamente validan objetos mock y ya quedan cubiertos; conservar los que prueban `utils`. Verificar que el total de tests no baja respecto al inicio de la sección 6. — Resultado de la revisión: se conservan todos. Los 23 casos de tipos no duplican a los nuevos (p. ej. "should not have legacy fields" protege contra campos eliminados) y borrarlos bajaría el total.

## 7. Documentación y cierre

- [x] 7.1 Actualizar en `AGENTS.md` la sección "The `pagosService` trap" y el árbol de Architecture (`lib/features/pagos/`, `domain/`, helper `__tests__/helpers/supabase-fake.ts`). Verificar que los ejemplos de código coinciden con las firmas reales.
- [x] 7.2 Verificación final: `npm run test`, `npx tsc --noEmit`, `npm run lint` y `npm run build` (con `.env.development`) en verde; `openspec validate pagos-service-testable --strict` sin errores. — Resultado: 296 tests, tsc, lint en verde; `next build` 34/34 páginas con variables ficticias en línea de comando (no hay `.env.development` en esta máquina).
