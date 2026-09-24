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
- **pre-push** (`.husky/pre-push`): `next build`. Requires `.env.development` with the Supabase variables; without them the build fails while collecting API routes.
- Emergency bypass: `git commit --no-verify` / `git push --no-verify`. Do not use it to skip failing tests.
- `.gitattributes` forces LF on `.husky/*` so the hooks run under Git for Windows `sh`.

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
  api/notificaciones/  # Cron: weekly notification dispatch + admin-triggered
    route.ts          # POST: auth (cron secret OR admin token), frequency check, dispatches types
    procesar/route.ts # POST: manual trigger by admin, `forzar` bypasses frequency
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
- `.env.development` — Supabase dev variables (Next.js reads in dev mode)
- `.env.prod` — Supabase production variables
- `.env.local` — Local PostgreSQL credentials (for migrate-db-new.ps1)

**Supabase variables** (in `.env.development` / `.env.prod`):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — admin key (server-side only, never expose to client)
- `NEXT_PUBLIC_SITE_URL` — callback redirect origin
- `NEXT_PUBLIC_ADMIN_EMAIL` — initial admin email
- `GMAIL_USER` — Gmail address for sending password reset emails
- `GMAIL_APP_PASSWORD` — Gmail App Password (16 chars, NOT your real password)

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

**Loading rule (perf)**: the dashboard fetches `get_pagos_por_anio` **once** and computes everything with `pagosService.calcularDashboard(elegibles, pagosDelAnio, anio)` (or `cargarDashboard(anio)` in one call). Do **not** call `stats()` and `monthlyStats()` separately there: together they download the year's payments 3 times. `loadData` fires all queries right after `getUser` but consumes them in two steps (profile/elegibles, then the rest) to keep the original error behavior.

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
- Each has: `habilitado`, `frecuencia_diaria/semanal/quincenal/mensual`, `dias_previo`
- `notificaciones_enabled` in `gym_config` is the master toggle (shows/hides the section)
- `frecuencia_diaria` = runs every day (requires daily cron trigger)

### Billing Mode (`gym_config.billing_mode`)
- `"dia_uno"` (default): all members billed on the 1st of each month
- `"fecha_inscripcion"`: each member billed on their inscription day (adjusted for month length)
- Affects: `getDiaCobro()`, `getMiembrosMorosos()`, `procesarRecordatorioPago()`
- Configurable via UI: Notificaciones → Modo de cobro radio buttons

### Log (`notificacion_log` table)
- `id_notificacion_config` (FK), `miembros_notificados`, `sin_problemas`, `error_detalle`, `fecha_hora_envio`

### Execution flow
1. **Cron**: `POST /api/notificaciones` with `Authorization: Bearer <CRON_SECRET>` or admin JWT. Recommended schedule: `0 0 * * *` (daily at midnight)
2. **Manual**: `POST /api/notificaciones/procesar` with admin JWT + `{ tipo?: string, forzar?: boolean }`
3. Route queries `notificacion_config WHERE habilitado = true`, loops configs, checks frequency (skipped if `forzar`), calls `ejecutarTipo()`
4. `ejecutarTipo()` dispatches to `procesarMiembrosDeudores`, `procesarRecordatorioPago`, `procesarResumenDueno`, `procesarEstatusSistema`
5. Each logs to `notificacion_log` (success or error)

### Recordatorio de Pago - Día de Cobro
- `recordatorio_pago` uses per-member billing day logic
- Billing day = day of inscription, adjusted for months with fewer days (e.g., Feb 28/29)
- Notification sent on `diaCobro - dias_previo` (wraps to previous month if < 1)
- No grace period: first billing month is inscription month
- Helper functions in `lib/utils.ts`: `getDiaCobro()`, `getDiaNotificacion()`, `esDiaDeNotificacion()`

### Miembros Morosos - Día de Cobro
- `getMiembrosMorosos()` uses `getDiaCobro()` to determine debt start
- First debt month = inscription month (no grace period)
- Current month only counted as debt if `hoy.getDate() >= diaCobro`

### Dashboard trigger
- `app/dashboard/page.tsx` fires `procesarTodasLasNotificaciones()` on mount when `notificaciones_enabled` is true (background, no await)

### Sidebar
- Notifications link at top level: `<SidebarItem icon={Bell} label="Notificaciones" href="/dashboard/configuracion/notificaciones" />`

### Per-type execution
- "Ejecutar Ahora" on a specific type sends `{ tipo: "miembros_deudores", forzar: true }` → API skips frequency, executes only that type
- `forzar: true` bypasses `verificarFrecuencia()` — always runs regardless of last execution date

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
