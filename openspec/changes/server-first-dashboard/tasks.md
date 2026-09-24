# Tasks

Cada tarea termina con `npm run test`, `npx tsc --noEmit` y `npm run lint` en verde.

## 1. Consultas y derivación compartidas

- [x] 1.1 `PagosService.consultarElegibles()` (las 4 consultas, sin filtrar) y `getMiembrosElegibles()` = `filtrarElegibles(await consultarElegibles(), new Date())`. Verificar que los tests de caracterización pasan sin cambios.
- [x] 1.2 `lib/features/dashboard/carga.ts`: `consultarDashboard(supabase, anio)` → datos crudos o `null` (sin sesión o ante cualquier error, nunca rechaza), con pendientes propios solo para no-admin; `derivarDashboard(...)` puro (miembros mapeados, stats, monthlyStats, recientes[0..5]). Tests con el doble de Supabase: estructura, `null` sin usuario, `null` ante error, pendientes solo para no-admin, y que `derivarDashboard` coincide con lo que calculaba `loadData`.

## 2. Server Component + cliente

- [x] 2.1 Mover la UI a `app/dashboard/dashboard-client.tsx` (`DashboardClient`) y hacer que `loadData` use los mismos helpers de aplicación de estado que la carga inicial. La primera carga usa `datosIniciales` si no es `null` y su año coincide con el del navegador; si no, usa `loadData`. Seguro con StrictMode (el efecto doble no descarta los datos).
- [x] 2.2 `app/dashboard/page.tsx` como Server Component: `createClient()` de servidor + `consultarDashboard(...)` sin `await`, pasado como prop.
- [x] 2.3 `AuthService` con cliente perezoso. Verificar que `next build` sin variables de entorno ya no falla en el prerender de `/login`. — Resultado: `/login` ya prerenderiza sin variables. Sin variables, `/dashboard` falla ahora en `components/ui/avatar.tsx:15` (crea el cliente en cada render); solo afecta builds sin variables, anotado en ROADMAP.

## 3. Verificación con la app real (base local)

- [ ] 3.1 Benchmark (build de producción, red de teléfono simulada): rama `dev`, fase 4 y fase 7, admin y miembro. Registrar ms, peticiones y KB.
- [ ] 3.2 Texto visible idéntico a la rama `dev` para admin y para miembro; cambio de año (a 2025 y de vuelta) funciona y coincide con la rama `dev`.

## 4. Documentación

- [ ] 4.1 `AGENTS.md` (Dashboard Stats Logic y Architecture) y `openspec/ROADMAP.md` con resultados.
