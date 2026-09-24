# Proposal

## Why

El dashboard es 100 % Client Component (`app/dashboard/page.tsx:1`, `"use client"`). Hoy la carga es así:

1. Se descarga el HTML con el loader.
2. Se descarga el JS y la página se hidrata.
3. Desde el teléfono: `getUser` y después todas las consultas a Supabase (`loadData`).

Cada consulta paga la latencia móvil teléfono ↔ Supabase, y ninguna puede empezar hasta que el JS terminó de cargar. Medido con `scripts/bench-dashboard.mjs` tras la fase 4: ~1005 ms hasta ver los datos, con red de teléfono simulada.

## What Changes

- `app/dashboard/page.tsx` pasa a ser un **Server Component** que, con la sesión del usuario (cookies, anon key, mismo RLS; nunca service role), **inicia** las consultas del dashboard y pasa la promesa de datos crudos al componente cliente. No la espera: el HTML con el loader sale enseguida y los datos llegan en la misma respuesta.
- La UI actual se mueve sin cambios visuales a `app/dashboard/dashboard-client.tsx`. En la primera carga usa los datos del servidor, sin volver a consultar desde el teléfono. Los cambios de año y los modales siguen consultando desde el navegador, como hoy.
- **Los cálculos siguen en el navegador**, con la hora local del usuario. El servidor (UTC en Vercel) solo trae datos crudos. Así "mes actual", "día de cobro" y "hoy" no cambian entre las 20:00 y las 24:00 hora de Venezuela en fin de mes.
- Nuevo `lib/features/dashboard/carga.ts`: `consultarDashboard(supabase, anio)` (consultas, usable en servidor y en tests) y funciones puras para derivar el estado. `PagosService` expone `consultarElegibles()` (las 4 consultas sin filtrar), y `getMiembrosElegibles()` pasa a usarlo.
- `AuthService` crea su cliente de forma perezosa (mismo arreglo que `PagosService`), para que el prerender de `/login` no falle sin variables de entorno.

## Non-goals

- Mismas cifras, textos, orden y permisos. Se verifica comparando el texto visible del dashboard entre la rama `dev` y esta, para admin y para miembro.
- Mismo loader "Cargando dashboard" mientras llegan los datos: la experiencia de carga no cambia, solo su duración.
- Si falla la carga del servidor, o si el año del servidor no coincide con el del navegador (Nochevieja), el cliente cae a la carga actual del navegador, con el mismo manejo de errores y el mismo toast.
- No se convierten otras páginas en esta fase.

## Capabilities

### New Capabilities
<!-- Ninguna: optimización sin cambios de comportamiento (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- `app/dashboard/page.tsx` (nuevo Server Component), `app/dashboard/dashboard-client.tsx` (UI existente).
- `lib/features/dashboard/carga.ts` (nuevo), `lib/features/pagos/service.ts` (`consultarElegibles`).
- `lib/services/auth/auth.service.ts` (cliente perezoso).
- `/dashboard` pasa de prerender estático a render dinámico por petición (lee cookies).
