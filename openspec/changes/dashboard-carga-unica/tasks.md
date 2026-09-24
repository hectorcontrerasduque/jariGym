# Tasks

Cada tarea termina con `npm run test`, `npx tsc --noEmit` y `npm run lint` en verde.

## 1. Carga única en el servicio

- [x] 1.1 Añadir `PagosService.cargarDashboard(anio?, supabaseClient?)`: `Promise.all([getMiembrosElegibles, get_pagos_por_anio])` y cálculo con `calcularMorosos`, `calcularStats`, `calcularMonthlyStats` con un único `hoy`. Verificar con un test de equivalencia: para varios escenarios (deudores, al día, libres, dueño, año anterior), `cargarDashboard` devuelve lo mismo que `getMiembrosElegibles` + `stats` + `monthlyStats` del código existente con los mismos datos.
- [x] 1.2 Test de conteo: `cargarDashboard` hace exactamente 1 llamada a `get_pagos_por_anio` y las 4 consultas de elegibles, todas lanzadas antes de esperar cualquier respuesta.

## 2. Dashboard en una ronda

- [ ] 2.1 Reescribir `loadData` en `app/dashboard/page.tsx` para usar una sola ronda paralela (perfil, `cargarDashboard`, recientes, años, config) conservando: el mismo manejo de `cancelled`, el mismo toast de error, la consulta de pendientes propios para no-admin, el cálculo de `adminLevel` y el mapeo de `miembros`. Verificar con `npx tsc --noEmit`, lint y revisión del diff (mismos `set*` con los mismos valores).
- [ ] 2.2 Verificar con `next build` (variables ficticias en línea de comando) que la página compila y se prerenderiza.

## 3. Documentación

- [ ] 3.1 Documentar en `AGENTS.md` (Dashboard Stats Logic) que el dashboard usa `cargarDashboard` y por qué no debe volver a llamar a `stats`/`monthlyStats` por separado. Actualizar `openspec/ROADMAP.md` con el resultado medido (llamadas y saltos).
