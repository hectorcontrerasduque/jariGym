# Tasks

## 1. Documentación

- [x] 1.1 Leer los 20 `route.ts` y documentar las 21 operaciones en `docs/api/openapi.yaml`; verificar contra la base local las afirmaciones no evidentes (`pagos/notify` → `ERROR 42703`; `ban_duration` → `missing unit in duration`).
- [x] 1.2 Validar con Redocly (`npm run docs:api:lint`): válido; las excepciones a reglas recomendadas se justifican en `redocly.yaml`.
- [x] 1.3 `npm run docs:api:build` genera la página HTML; revisada con una captura.

## 2. Sincronización

- [x] 2.1 `__tests__/api-docs.test.ts`; verificar que falla al añadir un `route.ts` sin documentar y al quitar un método documentado, y que pasa con el estado actual.

## 3. Registro

- [x] 3.1 `docs/api/README.md`, sección "API documentation" en `AGENTS.md` y hallazgos priorizados en `openspec/ROADMAP.md`.
