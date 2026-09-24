# Proposal

## Why

En desarrollo, Chrome muestra un error de hidratación de React en `/login`: *"A tree hydrated but some attributes of the server rendered HTML didn't match the client properties"*. La causa es que las posiciones de las partículas decorativas se generaban con `Math.random()` al cargar el módulo (`app/(auth)/login/page.tsx`, `const particles = generateParticles()`): el servidor calculaba unas posiciones (p. ej. `left: 70.87%`) y el navegador otras (`87.61%`). El bug ya existía en `dev`. El dashboard tenía el mismo patrón, aunque no fallaba porque sus partículas solo aparecen después de cargar los datos.

## What Changes

- Nuevo `components/ui/floating-particles.tsx`: las partículas se generan solo en el navegador (`useSyncExternalStore` con snapshot de servidor vacío) y se cachean por página, como antes.
- Login y dashboard usan ese componente con la misma cantidad (10 y 12) y los mismos colores; se eliminan las dos copias locales.
- Test de regresión `__tests__/floating-particles.test.ts`: el HTML del servidor no contiene partículas y es determinista.

## Non-goals

- Mismo aspecto: misma cantidad, colores, tamaños y animación. La única diferencia es que las partículas aparecen al hidratar (milisegundos después) en lugar de venir en el HTML.

## Capabilities

### New Capabilities
<!-- Ninguna (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- `components/ui/floating-particles.tsx` (nuevo), `app/(auth)/login/page.tsx`, `app/dashboard/dashboard-client.tsx`, `__tests__/floating-particles.test.ts`.
