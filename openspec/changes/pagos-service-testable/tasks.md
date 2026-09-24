# Tasks

Cada tarea se considera terminada solo si `npm run test`, `npx tsc --noEmit` y `npm run lint` terminan en verde.

## 1. Doble de prueba del cliente Supabase

- [ ] 1.1 Crear `__tests__/helpers/supabase-fake.ts` con `createSupabaseFake()` (query builder encadenable y thenable, respuestas FIFO por tabla/operación, `rpc`, `auth.getUser`, registro `calls`), según design D2. Verificar con `__tests__/helpers/supabase-fake.test.ts`: encadenamiento, orden FIFO, respuesta por defecto `{ data: null, error: null }` y registro de filtros.

## 2. Tests de caracterización sobre el código actual (sin tocar el servicio)

- [ ] 2.1 Crear `__tests__/pagos.service.test.ts` con `vi.mock("@/lib/supabase/client")` devolviendo el cliente falso, y cubrir el requirement "Miembros elegibles para cobro" (4 escenarios). Verificar que pasan contra `pagos.service.ts` sin modificar (`git diff --stat lib/` vacío).
- [ ] 2.2 Cubrir "Cálculo de miembros morosos": los 6 escenarios del spec más los casos límite de `fechaInicioMap` (membresía futura con y sin `start_date`) y el año anterior (mes tope = 12). Verificar que pasan sin modificar el servicio.
- [ ] 2.3 Cubrir "Miembros al día" y "Estadísticas anuales del dashboard", incluido que `stats` consulta `get_pagos_por_anio` para el año pedido. Verificar que pasan sin modificar el servicio.
- [ ] 2.4 Cubrir "Estadísticas mensuales del dashboard" (mes tope, filtro por fecha de inicio, usuario con aprobado y pendiente, `montoAcumulado` incluye a no miembros). Verificar que pasan sin modificar el servicio.
- [ ] 2.5 Cubrir "Meses pendientes de un miembro" (meses futuros, pendiente bloquea el mes, inicio en año posterior, error de consulta → `[]`). Verificar que pasan sin modificar el servicio.
- [ ] 2.6 Cubrir "Registrar un pago" y "Registrar un pago ya aprobado": sin sesión, RLS, falla del detalle con borrado compensatorio (verificar vía `calls` el `delete` sobre `payments` con el id), efectivo sin comprobante, rol no autorizado, inscripción que actualiza el perfil. Verificar que pasan sin modificar el servicio.
- [ ] 2.7 Cubrir "Aprobar y rechazar pagos" y "Solicitar suspensión de meses", incluido el filtro `status = pendiente` en el rechazo, la nota por defecto, que aprobar no filtra por estado, la actualización de pendientes existentes y el retorno `0` ante error. Verificar que pasan sin modificar el servicio.
- [ ] 2.8 Commit "test: characterization tests for PagosService" con la suite completa en verde.

## 3. Inyección de dependencias en PagosService

- [ ] 3.1 Aplicar design D1 en `lib/services/pagos/pagos.service.ts`: constructor con cliente opcional y getter perezoso `supabase`. Sin otros cambios en el archivo. Verificar que todos los tests de la sección 2 pasan sin modificarlos.
- [ ] 3.2 Añadir tests: `new PagosService(fake)` usa el cliente inyectado en escrituras y lecturas; `new PagosService()` no llama a `createClient` hasta el primer uso; el parámetro `supabaseClient` sigue teniendo prioridad sobre el cliente del constructor en los métodos de lectura. Verificar con `npm run test`.
- [ ] 3.3 Actualizar el comentario de la clase (`pagos.service.ts:34-47`) para documentar la inyección por constructor, manteniendo la advertencia sobre el uso en el servidor.

## 4. Migrar los tests a inyección por constructor

- [ ] 4.1 Cambiar `__tests__/pagos.service.test.ts` para construir `new PagosService(fake.client)` y eliminar su `vi.mock`. Las aserciones no cambian. Verificar con `npm run test`.
- [ ] 4.2 Cambiar `__tests__/morosos.test.ts` al mismo patrón (mismos 31 casos, mismas aserciones). Verificar que la cantidad de tests no baja.
- [ ] 4.3 Revisar `__tests__/pagos.test.ts`: eliminar solo los casos que solo validan objetos mock y ya quedan cubiertos por los tests nuevos; conservar los que prueban `utils`. Verificar que el total de tests y la cobertura de `lib/services/pagos` no bajan (`npx vitest run --coverage` si está disponible, o conteo de tests por archivo).

## 5. Documentación y cierre

- [ ] 5.1 Actualizar la sección "The `pagosService` trap" de `AGENTS.md` para describir la inyección por constructor y el helper `__tests__/helpers/supabase-fake.ts`. Verificar que los ejemplos de código del documento compilan con las firmas reales.
- [ ] 5.2 Verificación final: `npm run test`, `npx tsc --noEmit`, `npm run lint` y `npm run build` en verde; `openspec validate pagos-service-testable --strict` sin errores.
