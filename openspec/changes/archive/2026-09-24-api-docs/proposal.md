# Proposal

## Why

Los 20 archivos de `app/api/**/route.ts` (21 operaciones) no tenían documentación: solo aparecían en el árbol del README. Varios son delicados (cron de correos, migración pública, reseteo de contraseña, alta de miembros) y quien integra o revisa la API tenía que leer el código para saber qué autenticación piden, qué reciben y qué devuelven.

## What Changes

- `docs/api/openapi.yaml` (OpenAPI 3.1): autenticación, límite de peticiones, parámetros, cuerpo, respuestas y errores de cada operación, escritos a partir del código. Los hallazgos se marcan con ⚠️ en la descripción.
- `__tests__/api-docs.test.ts`: falla si código y documentación no coinciden (en ambos sentidos), si falta `operationId`/`summary`/`security`/respuesta de éxito, o si una referencia no existe. Corre en el pre-commit.
- `redocly.yaml` + `npm run docs:api:lint` (validación contra el estándar) y `npm run docs:api:build` (página HTML navegable, ignorada por git).
- `docs/api/README.md`: cómo verla y tabla resumen.
- Devdependency `yaml` para el test.

## Non-goals

- No cambia ningún endpoint. Los hallazgos (secreto por defecto, endpoints públicos con datos personales, `pagos/notify` roto, `ban_duration` inválido, borrado masivo de tokens) se documentan tal cual y quedan en ROADMAP para decisión.

## Capabilities

### New Capabilities
<!-- Ninguna: documentación (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- Nuevos: `docs/api/openapi.yaml`, `docs/api/README.md`, `redocly.yaml`, `__tests__/api-docs.test.ts`.
- `package.json` (scripts `docs:api:*`, devDependency `yaml`), `.gitignore` (`docs/api/index.html`), `AGENTS.md`, `openspec/ROADMAP.md`.
