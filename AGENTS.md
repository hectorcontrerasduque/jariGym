# GymApp SaaS - AGENTS.md

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Auth, PostgreSQL, Storage, Edge Functions)
- **Tailwind CSS** with custom `gym-*` color palette + gold neon effects for super admin
- **nodemailer** for transactional emails (Gmail SMTP)
- Multi-tenant SaaS for gym management

## Commands

```bash
npm run dev        # dev server on localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm run test       # Vitest (single run)
npm run test:watch # Vitest (watch mode)
npm run typecheck  # tsc --noEmit
```

No CI pipelines. No Node.js in WSL — run npm from Windows PowerShell (macOS: Homebrew Node works too).

### Git hooks (husky + lint-staged)

Installed automatically by `npm install` / `npm ci` (`prepare` script).

- **pre-commit** (`.husky/pre-commit`, ~4 s): `eslint --max-warnings=0` on staged files, `tsc --noEmit`, `vitest run`.
- **pre-push** (`.husky/pre-push`): `next build`. Needs the Supabase variables in `.env.local`: `next build` runs with `NODE_ENV=production`, so it reads `.env.production.local` → `.env.local` → `.env.production` → `.env`, and **never** `.env.development` (that one is dev-only). Without those variables the build fails while collecting API routes.
- Emergency bypass: `git commit --no-verify` / `git push --no-verify`. Do not use it to skip failing tests.
- `.gitattributes` forces LF repo-wide (`* text=auto eol=lf`, plus `.husky/*`) so the hooks run under Git for Windows `sh` and Windows edits don't produce phantom whole-file diffs.

### Local database (Supabase local, Docker)

Everything runs on your machine; nothing touches the cloud projects.

```bash
npm run db:local:start   # start Supabase local (first run downloads images; Docker Desktop must be running)
npm run db:local:reset   # wipe + schema + seed, writes .env.development.local (npm run dev then uses the local DB)
npm run db:local:stop    # stop it
node scripts/bench-dashboard.mjs http://localhost:3000 7 150   # dashboard load benchmark (phone-like latency)
```

- Seed users (password `Local1234!`): `admin@gym.local` (super_admin/owner), `miembro@gym.local`, `socio01..78@gym.local`. 80 members, ~800 payments over last + current year, 6 legacy `migracion` people. Deterministic: every reset produces the same data.
- Studio: http://127.0.0.1:54323 · API: http://127.0.0.1:54321 · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Delete `.env.development.local` to point `npm run dev` back at the cloud dev project.
- Schema = `supabase/local/000_*.sql` → `supabase/migrations/*.sql` → `supabase/local/001_*.sql`. The `supabase/local/` files reconstruct objects that exist in the real DB but were never committed (`migracion` table, `get_pagos_por_anio`). **`.gitignore` ignores `supabase/migrations/*.sql`**, so migrations 051–054 and 056 exist only in the real DB; the local schema can drift (e.g. `payments.status` still allows `suspendido`). Replace the reconstructions with a real schema dump when possible.

### API documentation

- `docs/api/openapi.yaml` (OpenAPI 3.1) documents every `app/api/**/route.ts`; `docs/api/README.md` has the summary table.
- **Adding/removing/renaming an endpoint or method requires updating `openapi.yaml`**: `__tests__/api-docs.test.ts` fails otherwise (and blocks the commit). Each operation needs `operationId`, `summary`, explicit `security` (`[]` when public) and a success response.
- `npm run docs:api:lint` validates the spec (Redocly, config in `redocly.yaml`); `npm run docs:api:build` generates `docs/api/index.html` (gitignored).

### Refactor tracking (OpenSpec)

Changes live in `openspec/changes/<name>/` (proposal, specs, design, tasks); roadmap in `openspec/ROADMAP.md`; project rules in `openspec/config.yaml`. Commands: `/opsx:propose`, `/opsx:apply`, `/opsx:archive`.

## Architecture

```
app/
  (auth)/login/     # Auth pages (route group, no /auth prefix)
  (auth)/reset-password/  # Public password reset form
  auth/callback/    # OAuth callback route handler + gym owner → super_admin promotion
  dashboard/        # All app pages under /dashboard/*
    configuracion/   # Gym config, logos, payment methods, dueno email
    miembros/        # Member management (CRUD, toggle status, notas_admin, stats with max_miembros)
    pagos/           # Payment list (super_admin), inline filter by member
    reportar-pago/   # Create payments (admin for others, miembro for self, super_admin can approve)
    mis-pagos/       # Miembro's own payment history
    perfil/          # Profile edit (supports ?user_id for super_admin)
  configuracion/notificaciones/  # Notification config (4 types, per-type toggle, Ejecutar Ahora)
  api/miembros/      # POST endpoint for creating members
  api/migracion/     # POST: migrate member data from Excel, search, ping
  api/profile/       # PUT endpoint for profile updates (uses service role key)
  api/notificaciones/  # Cron: daily notification dispatch + admin-triggered
    route.ts          # GET/POST: auth (cron secret OR admin token), frequency check, dispatches types
    procesar/route.ts # POST: manual trigger by admin, `forzar` bypasses frequency
  api/push/
    subscriptions/    # POST/DELETE: alta/baja de suscripción push por dispositivo (sesión)
  api/auth/
    forgot-password/ # POST: generates token + sends email via Gmail SMTP
    reset-password/  # POST: validates token + sets new password
    ensure-super-admin/ # POST: creates or promotes super_admin profile
lib/
  supabase/
    client.ts       # Browser client (createBrowserClient)
    server.ts       # Server client (async cookies())
    middleware.ts   # Auth guard middleware
  features/         # Target architecture: one module per feature (see openspec/ROADMAP.md)
    pagos/
      domain/       # PURE calculations: elegibles, morosos, al día, stats, meses pendientes
      service.ts    # PagosService: Supabase queries + delegates to domain/
    dashboard/
      carga.ts      # consultarDashboard (server-side raw fetch) + mapearMiembros
    notificaciones/
      datos.ts      # Shared email data: etiquetaFrecuencia, calcularResumenDueno, calcularEstatusSistema, contarMigraciones, pagosDelMes
      frecuencia.ts # verificarFrecuencia() puro: fecha_objetivo − days_before (lunes / 15+fin / fin) + piso de 7 días para deudores
      ejecucion.ts  # Los 4 procesadores + ejecutarCorrida() (batch log + purge + reporte); usado por cron Y manual
      reporte.ts    # Reporte de corrida en texto plano (solo cron) + contarMiembrosActivos()
      horario.ts    # horarioNotificaciones(): lee vercel.json para la franja de horario en la UI
    push/
      types.ts      # PayloadPush, ResultadoPush, MotivoOmitidoPush (nunca excepciones)
      service.ts    # Server: enviarPushAUsuarios/enviarPushAAdmins; fail-open, gate push_enabled
      dispositivo.ts # Client: permisos, Service Worker, alta/baja en /api/push/subscriptions
  services/         # Legacy modules, migrated to features/ phase by phase
    auth/           # signIn, resetPassword, getProfile
    config/         # Config CRUD + dueno email promotion on change
    email/          # nodemailer Gmail SMTP service
    email/templates/ # HTML email templates (reset password, welcome)
    miembros/       # Miembros CRUD + stats
    notificaciones/ # Notification service
  types.ts          # All TypeScript interfaces
  utils.ts          # cn(), formatCurrency(), formatDate(), getMonthName()
  messages.ts       # Centralized i18n messages for all modules
components/
  ui/               # Reusable primitives (button, card, input, avatar, badge, modal)
  ui/toast.tsx      # showToast(message, type) + ToastContainer
  ui/loading-overlay.tsx  # LoadingOverlay component
  ui/password-input.tsx   # PasswordInput with eye toggle
  sidebar.tsx       # Desktop sidebar + mobile bottom nav (gold effects for super_admin)
  push/
    boton-suscripcion.tsx  # Botón estado push (sidebar admin y miembro, variantes fila/icono)
    auto-suscripcion.tsx   # Auto-suscripción de miembros (1 intento por dispositivo, localStorage)
    modal-activar-push.tsx # Interstitial al reportar pago con push sin decidir (nunca bloquea el pago)
    use-estado-push.ts     # Hook compartido de estado push (campana + modal)
  auth-footer.tsx   # Fixed footer for auth pages
  scroll-to-top.tsx # Scroll to top on route change
  providers.tsx     # Client wrapper with ToastContainer
supabase/
  migrations/       # SQL migrations (run manually in Supabase SQL Editor)
  functions/        # Deno Edge Functions (deploy via Supabase CLI)
__tests__/
  helpers/supabase-fake.ts  # Programmable Supabase client double (queue replies, inspect calls)
  pagos.service.test.ts     # Characterization tests of PagosService (pin current behavior)
  pagos.domain.test.ts      # Pure unit tests of lib/features/pagos/domain
  push.service.test.ts      # Fail-open + gate de lib/features/push/service (doble de Supabase + web-push)
  migracion.test.ts         # Unit tests for migration flow
```

## Supabase Client Pattern (CRITICAL)

Three separate clients exist for three contexts:
- **Browser**: `lib/supabase/client.ts` — `createBrowserClient()`, sync
- **Server**: `lib/supabase/server.ts` — `await createClient()`, **async** (uses `await cookies()`)
- **Middleware**: `lib/supabase/middleware.ts` — `createServerClient()`, sync

**Do not mix these up.** Server client is `async` — always `await` the call.

### The `pagosService` trap

`PagosService` (`lib/features/pagos/service.ts`) resolves its Supabase client like this:
- `new PagosService(client)` → uses `client` for every method.
- `new PagosService()` / the exported `pagosService` → lazily creates the **browser client** (anon key + user cookies) on first use.

In **server-side API routes** the browser client has **NO user session**, so queries run as unauthenticated anon and RLS returns empty results.

**Rule**: server code must inject its client — via the constructor, or via the optional `supabaseClient` argument of read methods (it wins over the constructor client).

```ts
// CORRECT — API route injects its service_role client
const service = new PagosService(supabase);
const morosos = await service.getMiembrosMorosos();
// also correct (existing routes)
const morosos = await pagosService.getMiembrosMorosos(undefined, supabase);

// WRONG — browser client with no auth in server context
const morosos = await pagosService.getMiembrosMorosos();
```

### Testing a service

Calculations go in `lib/features/<feature>/domain/` as pure functions that receive `hoy: Date` instead of calling `new Date()`; test them with literal data. For the service itself, inject the fake client:

```ts
import { createSupabaseFake } from "./helpers/supabase-fake";
const fake = createSupabaseFake();
fake.setUser({ id: "admin-1" });
fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
fake.onRpc("get_pagos_por_anio").reply({ data: [] });
const service = new PagosService(fake.client);
// ...then assert on fake.callsTo("payments", "update")[0].payload / .filters
```

## Environment Variables

**Structure (gitignored):**
- `.env.local` — what this machine actually uses: Supabase dev variables, GMAIL SMTP, `CRON_SECRET` and the local PostgreSQL credentials (for migrate-db-new.ps1). Read by both `npm run dev` and `npm run build`.
- `.env.development` — optional dev-only override (`next dev` reads it, `next build` never does). Absent by default.
- `.env.development.local` — written by `npm run db:local:reset`, beats `.env.local` in dev mode.
- `.env.prod` — Supabase production variables. Next.js does not read this name: `next build` looks for `.env.production` / `.env.production.local`.

**Supabase variables** (in `.env.local` for dev, production env for deploys):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — admin key (server-side only, never expose to client)
- `NEXT_PUBLIC_SITE_URL` — callback redirect origin
- `NEXT_PUBLIC_ADMIN_EMAIL` — initial admin email
- `GMAIL_USER` — Gmail address for sending password reset emails
- `GMAIL_APP_PASSWORD` — Gmail App Password (16 chars, NOT your real password)

**Cron variables** (production env; absent = cron blocked):
- `CRON_SECRET` — bearer token Vercel Cron sends to `/api/notificaciones` (missing → 401 fail-closed)
- `CRON_ENABLED` — must be `"true"` for the `CRON_SECRET` path to execute; any other value blocks it (200, `ejecutadas: 0`, no emails). Set it **only** in the production Vercel project; leave it unset in dev. Manual super_admin runs ignore it.

**Local PostgreSQL** (in `.env.local`):
- `LOCAL_DB_HOST` — localhost
- `LOCAL_DB_PORT` — 6000
- `LOCAL_DB_USER` — postgres
- `LOCAL_DB_PASS` — local password
- `LOCAL_DB_NAME` — postgres

## Database

Schema managed via numbered SQL files in `supabase/migrations/`. Run manually:
1. Go to Supabase Dashboard → SQL Editor
2. Paste migration content → Run

Tables: `profiles`, `membresias`, `pagos` (header), `detalle_pago` (detail per month/inscription), `pagos_historial` (old data), `gym_config`, `gym_config_payment_methods`, `migracion`, `notificacion_config`, `notificacion_log`, `password_reset_tokens`

RLS uses helper functions (`get_user_role()`, `get_user_tenant_id()`) with `SECURITY DEFINER` to avoid infinite recursion. **Never create RLS policies that query the same table directly.**

## Auth Flow

- **LOGIN RULE**: toda persona que haga login DEBE estar registrado en `profiles` con `registered: true` y `activo: true` (o `activo: null`). Excepciones: `NEXT_PUBLIC_ADMIN_EMAIL` y `gym_config.owner_email` se auto-crean como `super_admin` si no existen.
- Trigger `handle_new_user` auto-creates `profiles` row on signup, pero con `registered: false` por defecto → no puede logearse
- Middleware redirects unauthenticated users to `/login`
- Google OAuth: Supabase → Google → `/auth/callback?code=...` → `exchangeCodeForSession` → verifica profile `registered: true` → redirect a `/dashboard`
- Email/password via `signInWithEmail` → `isAuthorizedUser` verifica profile `registered: true`
- Password reset: custom flow via `/api/auth/forgot-password` → token in `password_reset_tokens` → email via Gmail SMTP → `/reset-password?token=xxx` → validates token + sets new password
- **Gym owner detection**: Si el email coincide con `gym_config.owner_email`, se auto-crea profile `super_admin` con `registered: true`
- **Email change**: Cuando se cambia `owner_email` en Config, se desactiva profile anterior (`activo: false`) y se crea nuevo `super_admin` para el nuevo email via `ensure-super-admin` (sync auth.users)

## Super Admin (Dueño) — Gold Identity

The gym owner (`super_admin` role) has distinct gold neon visual effects:
- **CSS**: `neon-gold` (gold text-shadow), `neon-admin-ring` (animated gold gradient ring around avatar), `admin-welcome-banner` (animated gold gradient background)
- **Sidebar**: Avatar with gold glow ring, gym logo with gold background `bg-gradient-to-br from-yellow-500/30 to-amber-600/30`, name in gold text
- **Dashboard**: Welcome banner "Bienvenido, Administrador" with crown emoji, floating gold particles (auto-fades at 5s)
- **Access**: Can report payments, approve them, manage all members and config

Detection in code:
```tsx
const isSuperAdmin = profile?.role === "super_admin";
// Sidebar, dashboard, etc. use this to apply gold effects
```

## Mobile Bottom Nav

- 4 items for admin: Dashboard, Pagos, Miembros, Config
- 2 items for miembro: Mis Pagos, Perfil
- Each item uses `flex-1` for equal width distribution
- `ScrollToTop` component resets scroll position on route change
- `pb-24` in layout ensures content doesn't hide behind fixed nav

## Key Patterns

### Toast Notifications
```tsx
import { showToast } from "@/components/ui/toast";
showToast(messages.toast.success, "success"); // or "error", "warning", "info"
```

### Modal Component
- Auto-scrollable (`max-h-[90vh] overflow-y-auto`)
- Escape key closes
- Overlay: `bg-black/70 backdrop-blur-sm` (not 50 — too transparent)

### Profile Creation (Centralized)
```ts
import { createOrUpdateProfile } from "@/lib/services/miembros/profile.service";
// Always use this function. Never call .from("profiles").insert() or .upsert() directly.
const profile = await createOrUpdateProfile(supabase, {
  id: userId,        // required
  email: email,      // required
  full_name: name,   // required
  role: "miembro",   // default: "miembro"
  // optional: activo, registered, inscription_paid, inscription_date,
  // start_date, avatar_url, phone_number
});
```
- Uses `upsert` with `onConflict: "id"` — safe if `handle_new_user` trigger already created the row
- **DO NOT** use for updating existing profiles (use `.update()` directly to preserve fields like `role`)

### Profile Type
```ts
role: "super_admin" | "miembro"
activo: boolean | null  // null = active (DO NOT use `if (profile.activo)` — null is active!)
registered: boolean  // must be true to login (except admin/owner emails)
notas_admin: string | null
inscripcion_pagada: boolean
inscripcion_fecha: string | null
hora_llegada: string | null  // HH:MM format
hora_salida: string | null   // HH:MM format
```

### Payment Status
```ts
status: "pendiente" | "aprobado" | "rechazado"
// suspendido_pendiente was removed in commit 3360da2
// suspendido was removed in commit 5854c41
// Suspension flow: member requests → pendiente → admin approves → aprobado
```

### Dashboard Stats Logic
- **Source of truth for every figure** (inscritos, deudores, al día, monthly stats, meses pendientes): `openspec/specs/pagos/spec.md`, implemented as pure functions in `lib/features/pagos/domain/`.
- **Pagos recientes**: Approved payments only, with fallback when profile join fails

**Loading rule (perf)** — `/dashboard` is server-first:
- `app/dashboard/page.tsx` is a **Server Component**: it creates the server client (user cookies + anon key → same RLS as the browser; **never** the service role) and starts `consultarDashboard(supabase, year)` **without awaiting it**, passing the promise to `DashboardClient`. The HTML with the loader goes out immediately and the data streams in the same response.
- `app/dashboard/dashboard-client.tsx` (the UI) uses that data on first load and **computes every figure in the browser** (`filtrarElegibles` + `pagosService.calcularDashboard`) with the user's local date. Do not move these calculations to the server: Vercel runs in UTC and "current month"/billing day would shift in the evening at month end.
- Year changes and modals load from the browser (`loadData`), which fetches `get_pagos_por_anio` once. Both paths apply state through the same `aplicarPaso1`/`aplicarPaso2` helpers; keep it that way so they cannot diverge.
- If the server data is `null` (no session, any error) or its year differs from the browser's, the client falls back to `loadData` with the original error handling.
- Measured with `scripts/bench-dashboard.mjs` (prod build, phone-like network): 1934 ms on the original code → 238 ms, 15 → 2 browser requests to Supabase.

### Miembros Stats
- Total card shows `active/max` format (e.g. `11/80`) using `gym_config.max_members`

### Payment Approval
- `aprobarPago()` now auto-updates `profiles.inscripcion_pagada = true` when approving inscription payments (checks `detalle_pago.tipo_pago`)
- Super admin can approve payments (not just regular admin)
- Suspension flow: member requests → `pendiente` → admin approves → `aprobado` (uses `payment_type: "suspension"` with amount 0)

### Config Service
- `updateConfig()` strips read-only fields (`id`, `created_at`, `updated_at`, `created_by`, `updated_by`) before Supabase update
- When `owner_email` changes, calls `ensure-super-admin` with JWT to create/promote super_admin + sync auth.users (name/email)
- `saveMetodosPago()` deactivates all existing records first, then activates the selected one (radio behavior — 1 solo activo global)
- Only 1 payment method active at a time per type (unique index `idx_one_active_per_method ON gym_config_payment_methods (payment_method) WHERE is_active = true`)
- Each payment method type (efectivo, bs, binance) has temporal versioning: old rows get `effective_to` set, new rows inserted with `effective_to=null`
- `getMetodosPago()` returns only active records (filtered by `is_active=true`)
- When gym_config is empty (first save), reloads page after save to sync sidebar state

### Member Creation
- POST `/api/miembros`: email required (no username), handles existing auth users, generates random password if empty
- Non-Gmail emails require password (validated client-side)

### Profile Page
- Accepts `?user_id=<uuid>` query param for super_admin to edit other users' profiles
- Password change syncs email to auth.users if profiles.email differs
- LoadingOverlay shows while saving

### Messages (i18n)
- All user-facing messages go through `lib/messages.ts`
- No hardcoded strings or `console.log`/`console.error` in app or lib code
- Server API routes import `messages` for error responses

### Logo Management
- Upload: stores in Supabase Storage `logos` bucket, updates `gym_config.logo_url`
- Delete: icon-only trash button (no text), removes from storage, sets `logo_url: ""`
- Default fallback: `Dumbbell` icon when no logo

### Member Self-Migration
- Login page has "Ya soy miembro" link → opens migration modal
- Flow: search by name → select match (if multiple) → create auth user + profile + pagos + detalle_pago + inscription
- Prerequisites: gym_config must exist + at least one enabled payment method with monto > 0
- Only processes `pagado` (→ aprobado) and `suspendido` (→ suspendido) records from `migracion` table
- Fuzzy name search: each word generates prefix match (word without last char) for partial matches
- Welcome email sent to new users after migration

## Known Issues / TODO

### Critical
- [x] **`aprobar_pago_atomico` RPC dropped** — FIXED: `aprobarPago()` now uses direct `.update()` on pagos table, no longer calls the RPC.
- [x] **`Profile.activo` type mismatch** — FIXED: Type updated to `boolean | null` in `lib/types.ts`.
- [x] **`confirmLink` in migration route** — FIXED: Token is now generated, stored in `password_reset_tokens`, and sent via welcome email. Dedicated `/api/auth/confirm-email` route validates it.
- [x] **Payment schema normalized** — FIXED: pagos = header (id, usuario_id, estado, metodo_pago, etc.), detalle_pago = detail (pago_id, mes, anio, tipo_pago, monto). Old pagos renamed to pagos_historial.

### Code Quality
- [x] **Hardcoded messages in API routes** — FIXED: `api/miembros/route.ts`, `api/profile/route.ts`, `lib/services/config/config.service.ts` now use `messages.ts`. Notification API routes also migrated.
- [x] **`ensure-super-admin` uses `listUsers()` to find one user** — FIXED: Now uses filtered query by email.
- [x] **`saveMetodosPago` swallows all errors silently** — FIXED: Now throws errors and uses radio behavior (1 solo activo global).
- [x] **14+ empty `catch {}` blocks** — FIXED: All silent catch blocks removed, no console.error either (centralized in messages.ts).
- [ ] **`migrateStep: "error"` state is dead code** in login page — never set, never reached
- [ ] **`errorConfig` and `existingUserTitle` messages defined but unused** in messages.ts

### Features
- [ ] No CI/CD pipelines
- [ ] No rate limiting on API routes (except forgot-password: 3/hour)
- [ ] Storage bucket `comprobantes` is private — need signed URLs for viewing
- [ ] No confirmation modal for payment deletion (uses `confirm()`)
- [ ] No pagination on pagos/miembros lists
- [ ] No dark mode support
- [ ] No PWA / offline support
- [ ] Migration 026 is nuclear reset (TRUNCATE + DELETE) with no safety guard

## Recent Git History (newest first)

```
5854c41 refactor: remove suspendido status
3360da2 refactor: remove suspendido_pendiente status
be47bf0 fix: add z-[250] download overlay spinner for morosos report
13922dc feat: mobile UX - FAB buttons + desktop submit
b4f94d8 fix: morosos name column no truncate
84cf911 fix: morosos report - all debtors sorted by debt desc
3682058 fix: loader stacking - portal to document.body
fe2898d fix: loader stacking - all loaders at fragment level
70fcd26 fix: mobile z-index - save button above animated container
e263c5e refactor: elimina console.* + centraliza strings en messages.ts para i18n
```

## Notifications System

### Config (`notificacion_config` table)
4 types: `miembros_deudores`, `recordatorio_pago`, `resumen_dueno`, `estatus_sistema`
- Each has: `is_active`, `daily/weekly/biweekly/monthly_frequency`, `days_before`
- `notificaciones_enabled` in `gym_config` is the master toggle (shows/hides the section)
- `daily_frequency` = runs every day (requires daily cron trigger)

### Frequency semantics (calendar + lead)
- Target dates are **calendar-based**: daily = every day; weekly = **Monday**; biweekly = **15th and last day of the month**; monthly = **last day of the month**.
- `fecha_envio = fecha_objetivo − days_before` (`days_before` = "días de anticipación", form field on all 4 cards, `min 0 / max 30`, default 0; daily ignores it). Implemented by inverting the lead: `objetivo = hoyVet(hoy) + days_before` then testing `esLunes` / `esDia15oFinDeMes` / `esFinDeMes` on that UTC date (`frecuencia.ts`).
- Runs once per **VET day** (`mismoDiaVet`); a first run with no `notification_log` row runs even if today is not a target day. A failed target day just waits for the next cycle (no retry).
- All date params are raw `Date`s; VET (UTC−4) conversion happens only inside `hoyVet`/`mismoDiaVet` — never shift a date twice.
- **Debtors floor**: `MIN_DIAS_AVISO_DEUDA = 7` hardcoded in `frecuencia.ts` — applies in addition to the lead, only to `miembros_deudores` (re-mailing the same debtor daily hurts deliverability). No DB field.

### Billing Mode (`gym_config.billing_mode`)
- `"dia_uno"` (default): all members billed on the 1st of each month
- `"fecha_inscripcion"`: each member billed on their inscription day (adjusted for month length)
- Affects: `getDiaCobro()`, `getMiembrosMorosos()`, `procesarRecordatorioPago()`
- Configurable via UI: Notificaciones → Modo de cobro radio buttons

### Log (`notificacion_log` table)
- `id_notificacion_config` (FK), `miembros_notificados`, `sin_problemas`, `error_detalle`, `fecha_hora_envio`
- **Batch at the end, only if everything succeeded** + purge to the last 10 rows per type (`LIMITE_BITACORA`) — see Execution flow

### Execution flow
1. **Vercel Cron** (vercel.json): `GET /api/notificaciones` daily at `0 4 * * *` (UTC) = midnight Venezuela (UTC-4). Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically; if the env var is missing the endpoint fails closed (401). Admin JWT also works (but is treated as a manual run → no report). Hobby plan: min 1 run/day, may fire anywhere within the scheduled hour (frequency logic only compares dates).
   **Environment gate**: the `CRON_SECRET` path only executes when `CRON_ENABLED=true` (deny by default) — without it the route answers 200 with `message` + `ejecutadas: 0` and runs nothing. This keeps the **dev Vercel project** (its own `vercel.json` cron, also `VERCEL_ENV=production`) from emailing against debugging data. Set `CRON_ENABLED=true` in the **production** Vercel project (mandatory after this change, else the real cron is off). Manual calls with super_admin JWT and `/api/notificaciones/procesar` ignore the gate — they are explicit instructions.
   **The schedule lives only in `vercel.json`** — to test, edit `schedule` in UTC (15:00 VET → `0 19 * * *`) and push; `npx vercel crons run /api/notificaciones` or a manual `curl` with `CRON_SECRET` also work. The Notificaciones page only *displays* it (`horarioNotificaciones()` in `horario.ts`, info strip under the master toggle) — there is no DB field and no guard on it.
2. **Manual**: `POST /api/notificaciones/procesar` with admin JWT + `{ tipo?: string, forzar?: boolean }`
3. Route queries `notification_config WHERE is_active = true`, loops configs, checks `verificarFrecuencia(config, ultimoIntento)` — calendar target − `days_before` (manual route skips the frequency check; `forzar` bypasses the same-day dedup), calls `ejecutarCorrida()`
4. `ejecutarCorrida()` dispatches to `ejecutarMiembrosDeudores`, `ejecutarRecordatorioPago`, `ejecutarResumenDueno`, `ejecutarEstatusSistema`, all in `lib/features/notificaciones/ejecucion.ts`. Both routes share this module so they cannot diverge.
5. **Logging rules** (`ejecutarCorrida`): the `notification_log` batch is written **at the very end of the run and only when no type failed** — one row per config that executed with `enviados > 0` (`no_issues: true`, `created_by` when there is a user). Nothing is written when `0/0` (an empty run must not consume the frequency window); on any failure or exception **zero rows are written** (detail goes only to the report — accepted trade-off: the frequency windows of the *successful* types do not advance that day). Failures carry the real reason per recipient (`email — mensaje`) in `fallidosA`.
6. **Purge**: after logging, each config keeps only the **last 10 rows** (`LIMITE_BITACORA = 10`, max 40 rows total): select ids by `sent_at desc`, delete the rest with `.not("id", "in", ...)` when there are more than 10. Purge errors become warnings in the report, not failures.
7. **Run report (cron only)**: `reporte.ts` builds a plain-text report — schedule + VET window, per-template status/frequency/last attempt, recipients, coverage % (`enviados/activos`, 1 decimal, "—" when there are no active members), failures with reasons, warnings (purge), totals and a pie line — and emails it to `NEXT_PUBLIC_ADMIN_EMAIL` via `sendRunReportEmail` (text/plain, no HTML/QR/bulk headers). **Sent only when there is information**: `debeEnviarReporte()` requires `enviados > 0` **or** `errores > 0` **or** warnings **or** a fatal error — an all-skipped run (0/0, like the daily frequency gate) builds the text (it travels in the JSON response) but does not email (`reporte_enviado: false`, `reporte_omitido: "sin_informacion"`). **Never** for admin-JWT runs (`origen: "manual"`) nor for guard returns (cron disabled / notifications disabled / no configs). A fatal route error still emails a minimal report (`enviarReporteFatal`) when authenticated with `CRON_SECRET`; the 500 body is unchanged. Denominator = profiles with `activo IS NOT FALSE` (all roles).
8. `resumen_dueno` and `estatus_sistema` build their payloads in `lib/features/notificaciones/datos.ts` (`calcularResumenDueno`, `calcularEstatusSistema`, `etiquetaFrecuencia`). `ResumenDueno.montoPendiente` = sum of the month's pending payment amounts — distinct from `montoDeuda` (general morosos debt).
9. **Time budget**: `iniciarPresupuesto()` (240 s of the route's `maxDuration = 300`). The email throttle lives **only** in `email.service` (`EMAIL_DELAY_MS = 1500` ≈ 24 correos/min, cómodo contra límites de Gmail y su tope de 500/día); antes había además 1 s de pausa redundante en `ejecucion.ts` (eliminada). Order of execution (`ordenarConfigs()`): single-recipient types (`resumen_dueno`, `estatus_sistema`) first — nunca quedan "no ejecutadas por presupuesto" —, then `recordatorio_pago`, then `miembros_deudores`. Each member batch is capped by `limiteTipoPara()` (restante − 25 % × total × lotes pendientes siguientes), so a big batch cannot starve the next one; inside each batch recipients go by urgency (morosos: deuda descendente; recordatorio: cobro más próximo primero). A cut sets `presupuestoAgotado` + `sinEnviar` and the run report prints `Quedaron sin enviar: N (se atenderán en el próximo ciclo)` — lists rebuild every cycle, so the remainder is served next cycle (no double-send). Loops stop early instead of dying mid-list.

### Recordatorio de Pago
- `recordatorio_pago` uses per-member billing day logic only for the **content** of the email (billing day = day of inscription, or the 1st in `dia_uno` mode, adjusted for month length — `fechasRecordatorio()` called with lead 0)
- **When it sends** is decided uniformly by the frequency gate (`verificarFrecuencia`, calendar + `days_before`) — there is **no per-member window** anymore
- **Recipients**: every active member (minus the owner, minus open-ended active memberships) who **owes next month** (`pagosDelMes(mes+1)`), i.e. has no approved payment for next month
- **Dedup**: one send per VET day — skipped when the last successful log for that config is today; `forzar` skips the dedup and its log query
- No grace period: first billing month is inscription month
- Helper functions in `lib/utils.ts`: `getDiaCobro()`, `getDiaNotificacion()`, `esDiaDeNotificacion()` (used only to render the email)

### Miembros Morosos - Día de Cobro
- `getMiembrosMorosos()` uses `getDiaCobro()` to determine debt start
- First debt month = inscription month (no grace period)
- Current month only counted as debt if `hoy.getDate() >= diaCobro`
- **Debt notices are never sent more than once every 7 days** (`MIN_DIAS_AVISO_DEUDA` in `frecuencia.ts`), even if the type is configured as daily — re-mailing the same debtor daily hurts deliverability

### Dashboard trigger
- There is **no** automatic trigger from `/dashboard`: `procesarTodasLasNotificaciones()` is only called from the Notificaciones config page ("Ejecutar Todo" / "Ejecutar Ahora", both with `forzar: true`). The cron is the only unattended sender.

### Sidebar
- Notifications link at top level: `<SidebarItem icon={Bell} label="Notificaciones" href="/dashboard/configuracion/notificaciones" />`

### Per-type execution
- "Ejecutar Ahora" on a specific type sends `{ tipo: "miembros_deudores", forzar: true }` → API skips frequency, executes only that type
- The manual route **never** checks `verificarFrecuencia()`; `forzar: true` additionally bypasses the recordatorio dedup (sends to everyone who has not paid next month)

## Web Push (push al navegador)

Módulo aislado en `lib/features/push/` — los llamadores solo importan `service.ts` (servidor)
o `dispositivo.ts` (cliente); nunca al revés (`service.ts` importa `web-push`, que es Node-only).

### Reglas de oro (fail-open)
- **Nunca lanza excepciones**: siempre devuelve `ResultadoPush { enviados, fallos, omitido }`.
  Un fallo de push jamás corta correos, cron ni guardados, y **nunca** marca `hayFallo` en
  `ejecutarCorrida` (solo puede aportar advertencias).
- Orden de compuertas en cada envío: sin claves VAPID → `omitido: "sin_configurar"` (sin red);
  luego `gym_config.push_enabled = false` → `omitido: "deshabilitado"`; solo entonces se
  resuelven destinatarios y se envía.
- El permiso de notificación es **por dispositivo** (lo otorga el navegador de cada persona);
  el interruptor `push_enabled` solo habilita el canal en el servidor. iOS ≥16.4 además
  requiere "Agregar a pantalla de inicio" (fallback: correo).

### Componentes
- **Tabla `push_subscriptions`** (user_id FK cascade, `UNIQUE (user_id, endpoint)` — 1 fila por
  dispositivo y sesión; el mismo endpoint con 2 cuentas convive) + **`gym_config.push_enabled`**
  (default false). Migración `supabase/migrations/058_push_subscriptions.sql`: **aplicar a mano
  en el SQL Editor** (las migraciones están en `.gitignore`, ver ROADMAP#10). Si falta la
  migración, `pushHabilitado()` lee error → apagado (fail-closed).
  RLS: cada usuario solo ve/agrega/borra **sus** suscripciones; service_role bypass RLS por
  atributo — **nunca** crear policy `USING (true)` (expondría la tabla a anon).
- **Rutas** `POST/DELETE /api/push/subscriptions` (sesión, rate limit 10/5min en POST):
  el POST responde `409` con `codigo: "sin_configurar" | "deshabilitado"` cuando el canal
  está apagado; el DELETE es idempotente. Documentadas en `docs/api/openapi.yaml`.
- **PWA mínima**: `public/sw.js` (muestra el push y al tocarlo abre/foca la app en `payload.url`;
  sin caché), `public/manifest.webmanifest` + `public/icons/*.png` (generados desde
  `public/favicon.svg` con sharp), metadata en `app/layout.tsx` (`manifest`, icono Apple,
  `viewport.themeColor`).
- **UI**:
  - Interruptor "Push al Celular" en Notificaciones (card propia, independiente del toggle de
    correo; al guardarlo dispara `config:updated` para refrescar el sidebar).
  - `BotonSuscripcion` en el sidebar **para admin y miembro** (fila desktop / icono en la barra
    superior móvil), visible solo si `push_enabled`; estados: activo / activar / bloqueado
    (permiso denegado → **clickeable**, muestra toast con pasos para desbloquear en Chrome, y
    refresca al volver de los ajustes del navegador vía `visibilitychange`). **Cuando el estado
    local es "activo" re-sincroniza la suscripción con el servidor** (`sincronizarSuscripcion`,
    POST upsert): el permiso/suscripción local son **por origen** (compartidos entre cuentas del
    mismo navegador) pero la fila es **por usuario** — sin este paso la campana decía "activas"
    y `push_subscriptions` no tenía fila del usuario de la sesión actual (push "enviado" a 0
    destinos). Si el POST falla → toast warning (409 → `deshabilitado`). Los miembros lo
    necesitan porque los eventos de pago son solo push. El estado lo calcula el hook
    **`useEstadoPush`** (compartido con el modal de pagos); en móvil el icono mide **44px**
    (`p-3` / `w-5 h-5`, `rounded-lg`, `active:scale-95`) y mientras está `inactivo` aplica
    `animate-pulse-glow` para invitar al toque.
  - `AutoSuscripcionMiembro` montado en `app/dashboard/layout.tsx`: miembros hacen **1 intento
    por dispositivo**; `push_auto_intentado` (localStorage) se marca **solo si el resultado es
    terminal** (`debeMarcarIntento`: suscrito o permiso bloqueado). Si el socio cierra el aviso
    (permiso `default`) o falla la sincronización → se reintenta en la próxima visita; si
    bloquea → lo activa desde la campana. Al terminar dispara el evento `push:estado` para que
    la campana refresque su estado.
  - **`ModalActivarPush` al reportar pago** (`app/dashboard/reportar-pago`): `handleSubmit`
    verifica `debePedirActivacion(await calcularEstadoPush())` (puro + testeado en
    `__tests__/push.dispositivo.test.ts`) y, si el permiso sigue **sin decidir**, retiene el
    envío y abre el interstitial: *Activar ahora* (el clic es el gesto válido →
    `requestPermission` → subscribe + sync → envía el pago) o *Continuar sin notificaciones*
    (envía igual, con toast del resultado). **El pago NUNCA se bloquea** — permiso bloqueado o
    sin soporte → envío directo sin modal. Escape/X cierra sin enviar (vuelve al formulario);
    tras cualquier elección dispara `push:estado` para refrescar la campana.

### Eventos de pago (`POST /api/pagos/notify`)
- El cliente solo manda `{ pagoId }` (los 5 call sites: pagos aprobar/rechazar, reportar-pago,
  mis-pagos, botón "Notificar al administrador" de mis-pagos). La ruta **deriva el evento** con
  `derivarEventoPago(status, callerRole, esDueno)`
  (`lib/features/pagos/domain/notify`, puro + testeado) — nunca confía en un `action` del cliente:
  - **aprobado/rechazado** (solo super_admin) → **push al miembro**. Motivo de rechazo
    = `payments.payment_note` (lo escribe `rechazarPago`).
  - **pendiente + miembro dueño** → **push a todos los super_admin** (`reportado`) — incluye
    solicitudes de suspensión (mis-pagos), pagos de mensualidad/inscripción auto-reportados y
    el **recordatorio manual** del miembro (grid "Pagos realizados" + modal de detalle: botón
    `BellRing` visible solo con `status === "pendiente"` y rol miembro; al enviar se marca
    `notificados` en sesión → check verde "Notificación enviada", sin spam).
  - **pendiente + super_admin de un tercero** → **push al miembro** (`registrado`); si es para
    él mismo → `evento: null` (sin notificar).
  - Límite 60/5 min por usuario (`applyRateLimit`, fail-open).
- **Solo web push, sin correo**: decisión de producto — los eventos de pago (pendiente /
  aprobado / rechazado) notifican únicamente por push; el cron de morosos/recordatorio sí
  conserva sus correos. `sendPaymentApprovedEmail`/`sendPaymentRejectedEmail` quedaron sin
  call sites.
- **Fix ROADMAP#5**: el monto es `SUM(payment_detail.payment_amount)`; antes se leía
  `payments.payment_amount` (inexistente) y la ruta respondía siempre 404 → las notificaciones
  de aprobado/rechazado **nunca** se habían enviado.
- `crearPagoSuspendido` ahora devuelve el **id del pago** (`""` si falló) — antes devolvía la
  cantidad de meses; mis-pagos usa ese id para disparar notify.
- `messages.eventosPago` + helper `mensaje(template, vars)` (placeholders `{nombre}`, `{monto}`…)
  para los textos de payload y errores de la ruta.
- Tests: `__tests__/pagos-notify-eventos.test.ts` (derivación completa + `mensaje`).

### Push en el cron de notificaciones
- Los lotes `ejecutarMiembrosDeudores` y `ejecutarRecordatorioPago` (en
  `lib/features/notificaciones/ejecucion.ts`) añaden un push **complementario** al correo,
  vía el helper interno `avisarPush(supabase, ids, payload, advertencias)`:
  import dinámico de `push/service`, mismo alcance que los correos intentados (no los
  cortados por presupuesto), payload con `url: "/dashboard/mis-pagos"`.
- **Fail-open reforzado**: `ResultadoEjecucion` ganó `advertencias: string[]`. Un fallo de
  push (`fallos > 0`, `omitido: "error"` o excepción) solo agrega una línea de advertencia —
  **nunca** incrementa `fallos`, nunca marca `hayFallo` → la bitácora (`no_issues: true`) se
  escribe igual y `errores` del reporte queda en 0. `sin_configurar`/`deshabilitado` son
  estados normales → sin advertencia.
- `ejecutarCorrida` fusiona `r.advertencias` en las advertencias del reporte del cron (ya
  existentes, junto a purga/contador), así que `debeEnviarReporte()` también dispara con
  solo avisos de push.
- Tests: `__tests__/notificaciones-ejecucion.test.ts` (mock global de push por defecto
  `sin_configurar`; casos: payload, fallo, excepción, deshabilitado, cortado por presupuesto,
  y corrida con bitácora intacta pese a push caído).
- **VAPID**: `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` (cliente, `NEXT_PUBLIC_*` se inlina en build) +
  `WEB_PUSH_PRIVATE_KEY` (solo server). Generar con `npx web-push generate-vapid-keys`.
  Sin ellas la app funciona igual (push omitido silenciosamente).
- **Tests**: `__tests__/push.service.test.ts` (gate, envíos, limpieza 410, admin band — con
  `createSupabaseFake` + `vi.mock("web-push")`).

## Migrations Applied

001–034 applied in Supabase SQL Editor. Key ones:
- **019**: RPC functions (aprobar_pago_atomico, etc.) — **NOTE: 020 dropped these, breaking approval**
- **020**: Dropped RPC functions
- **025**: RLS for pagos suspendido + migracion (service_role only)
- **026**: Nuclear reset — TRUNCATE pagos/membresias, DELETE all users/profiles/config
- **027**: Added `registered` boolean to profiles
- **028**: Added `tipo_pago` column to pagos (membresia/inscripcion)
- **029**: Notifications system — `notificacion_config`, `notificacion_log` tables + RLS
- **030a**: Added `hora_llegada` and `hora_salida` text columns to profiles
- **030b**: Suspension workflow — `suspendido_pendiente` estado, `created_by` audit column (historical, `suspendido_pendiente` removed in `3360da2`)
- **031**: RLS DELETE policies for `suspendido_pendiente` pagos (historical)
- **032**: Added `frecuencia_diaria` boolean to `notificacion_config`
- **033**: Added `modo_cobro` text to `gym_config` ('dia_uno' | 'fecha_inscripcion')
- **034**: Admin INSERT RLS for pagos + comprobantes storage
- **035**: **Payment normalization** — renames old `pagos` → `pagos_historial`, creates new `pagos` (header) + `detalle_pago` (detail per month/inscription). `CreatePagoInput` now takes `detalles[]` instead of flat fields.
- **056**: **Remove suspendido status** — updates existing `suspendido` → `aprobado`, tightens CHECK to `('pendiente', 'aprobado', 'rechazado')`. Apply manually in Supabase SQL Editor.
- **058**: **Web Push** — `push_subscriptions` table + RLS (own rows) + `gym_config.push_enabled`. Apply manually in Supabase SQL Editor (not versioned: `.gitignore` hides `supabase/migrations/*.sql`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
