# Proposal

## Why

Cambiar el rol de un miembro desde la pantalla de Miembros (`handleToggleSuperAdmin`, `app/dashboard/miembros/page.tsx`) fallaba con el toast "error al cambiar rol". La pantalla envía `PUT /api/profile` con solo `{ role, inscription_admin_note }`; el endpoint pasa `email: undefined` y `full_name: ""` a `createOrUpdateUser` (`lib/services/miembros/profile.service.ts`), cuya validación exigía email y nombre válidos **en toda llamada**, también al actualizar un perfil existente por `id`. Respuesta: `500 {"error":"Email inválido"}` y el rol no cambiaba (reproducido contra la base local). El bug ya existía en `dev`.

## What Changes

- `createOrUpdateUser`: al actualizar un perfil existente por `id`, email y nombre se validan **solo si vienen**. Crear un usuario sigue exigiendo ambos (`email_invalid` / `name_required`), igual que antes. La parte de actualización ya era parcial (solo escribe los campos presentes), así que no cambia.
- Un no-admin que cambia su contraseña sin enviar el email se verifica con el email del perfil, en lugar de uno vacío.
- Doble de Supabase: `auth.signInWithPassword` y `auth.admin.*` para poder probarlo.
- Documentación de `PUT /api/profile`: actualización parcial.

## Non-goals

- No cambia la creación de usuarios (callback OAuth, migración, alta de miembros, dueño), que siempre envían email y nombre.
- No cambia el guardado completo desde la pantalla de Perfil (cubierto por test).

## Capabilities

### New Capabilities
<!-- Ninguna (skip_specs: true). -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- `lib/services/miembros/profile.service.ts`, `__tests__/profile.service.test.ts` (nuevo), `__tests__/helpers/supabase-fake.ts`, `docs/api/openapi.yaml`.
