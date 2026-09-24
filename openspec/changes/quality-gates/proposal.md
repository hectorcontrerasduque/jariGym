# Proposal

## Why

No hay ninguna verificación automática antes de que el código entre al repo (no hay CI; `.git/hooks` no tiene hooks activos). Hoy la línea base está limpia (207 tests, `tsc` y ESLint en 0 errores y 0 warnings), pero ya se degradó una vez sin que nadie lo notara: los 10 tests de `__tests__/email.test.ts` quedaron rotos tras los rediseños de plantillas (`e12bbe6`, `45a1597`) y se corrigieron en `f12966b`. El refactor que sigue toca lógica de pagos, así que cada commit debe pasar por tests, tipos y lint.

## What Changes

- Añadir `husky` y `lint-staged` como devDependencies y el script `"prepare": "husky"` para instalar los hooks automáticamente con `npm install`/`npm ci`.
- Hook **pre-commit**: ESLint con `--max-warnings=0` sobre los archivos `.ts/.tsx/.js/.mjs` en stage, `tsc --noEmit` y la suite de Vitest completa (~5 s en total).
- Hook **pre-push**: `next build`, que detecta errores que `tsc` no ve (límites Server/Client Components, rutas).
- Documentar en `AGENTS.md` los hooks y cómo saltarlos en una emergencia (`--no-verify`).

## Non-goals

- No cambia ningún código de la aplicación, dependencias de runtime, ni configuración de ESLint/TypeScript/Vitest.
- No reemplaza a la CI (fase `ci-minimo`): los hooks se pueden saltar con `--no-verify`.
- No añade formateo automático (Prettier): reformatearía todo el repo y ensuciaría el historial del refactor.

## Capabilities

### New Capabilities
<!-- Ninguna: tooling de desarrollo, sin comportamiento de la aplicación (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- `package.json`, `package-lock.json`: devDependencies `husky`, `lint-staged`; scripts `prepare`, `typecheck` (ya existe).
- Nuevos `.husky/pre-commit`, `.husky/pre-push`.
- `AGENTS.md`: sección de comandos.
- Afecta al flujo de trabajo local en macOS y en Windows (PowerShell usa el `sh` de Git for Windows para los hooks).
