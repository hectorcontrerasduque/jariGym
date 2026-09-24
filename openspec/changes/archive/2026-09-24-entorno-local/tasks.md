# Tasks

## 1. Base local

- [x] 1.1 Inicializar Supabase local y verificar que `npx supabase start` levanta db, auth, rest, storage y studio con Docker.
- [x] 1.2 Reproducir las 52 migraciones desde cero y verificar cuáles fallan (025, 026 y 039, por falta de la tabla `migracion`); reconstruir en `supabase/local/` lo que falta hasta que la cadena completa se aplique sin errores.
- [x] 1.3 `scripts/db-local.mjs` con start/reset/stop y seed determinista; verificar que `npm run db:local:reset` termina con 80 usuarios, 810 pagos y el `.env.development.local` escrito.

## 2. Verificación con la app real

- [x] 2.1 `npm run dev` contra la base local: iniciar sesión como admin y verificar que el dashboard muestra datos (captura del benchmark).
- [x] 2.2 Benchmark con builds de producción de la rama `dev` (`fb59f8c`) y de esta rama sobre la misma base: 2 rondas de 7 cargas cada una, más la comparación del texto visible.

## 3. Documentación

- [x] 3.1 Sección "Local database" en `AGENTS.md` y resultados en `openspec/ROADMAP.md`.
