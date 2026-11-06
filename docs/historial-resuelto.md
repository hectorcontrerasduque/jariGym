# Historial de issues resueltos (referencia)

Items ya corregidos de `## Known Issues / TODO` de AGENTS.md. Aquí solo para contexto histórico.

## Critical
- [x] **`aprobar_pago_atomico` RPC dropped** — FIXED: `aprobarPago()` now uses direct `.update()` on pagos table, no longer calls the RPC.
- [x] **`Profile.activo` type mismatch** — FIXED: Type updated to `boolean | null` in `lib/types.ts`.
- [x] **`confirmLink` in migration route** — FIXED: Token is now generated, stored in `password_reset_tokens`, and sent via welcome email. Dedicated `/api/auth/confirm-email` route validates it.
- [x] **Payment schema normalized** — FIXED: pagos = header (id, usuario_id, estado, metodo_pago, etc.), detalle_pago = detail (pago_id, mes, anio, tipo_pago, monto). Old pagos renamed to pagos_historial.

## Code Quality
- [x] **Hardcoded messages in API routes** — FIXED: `api/miembros/route.ts`, `api/profile/route.ts`, `lib/services/config/config.service.ts` now use `messages.ts`. Notification API routes also migrated.
- [x] **`ensure-super-admin` uses `listUsers()` to find one user** — FIXED: Now uses filtered query by email.
- [x] **`saveMetodosPago` swallows all errors silently** — FIXED: Now throws errors and uses radio behavior (1 solo activo global).
- [x] **14+ empty `catch {}` blocks** — FIXED: All silent catch blocks removed, no console.error either (centralized in messages.ts).
