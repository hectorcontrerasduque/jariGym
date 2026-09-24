# Tasks

## 1. Hooks

- [x] 1.1 Instalar `husky` y `lint-staged` como devDependencies y ejecutar `npx husky init`; verificar que `package.json` tiene `"prepare": "husky"` y que `git config core.hooksPath` apunta a `.husky/_`.
- [x] 1.2 Configurar `lint-staged` en `package.json` para `*.{ts,tsx,js,mjs,cjs}` → `eslint --max-warnings=0`; verificar con un archivo en stage que contiene un error de lint que el commit se bloquea.
- [x] 1.3 Escribir `.husky/pre-commit` (`lint-staged`, `tsc --noEmit`, `vitest run`) y verificar que un test roto a propósito bloquea el commit y que con todo verde el commit pasa.
- [x] 1.4 Escribir `.husky/pre-push` (`next build`) y verificar que se ejecuta con `sh .husky/pre-push` en verde. — Nota: el hook se ejecuta, pero en macOS el build falla sin `.env.development` (el cliente de navegador se crea al importar `pagos.service.ts`; lo resuelve `pagos-service-testable`).

## 2. Documentación

- [x] 2.1 Documentar los hooks en `AGENTS.md` (sección Commands) y verificar que los comandos citados existen en `package.json`.
- [x] 2.2 Verificación final: `openspec validate quality-gates --strict` sin errores y commit realizado a través del propio hook.
