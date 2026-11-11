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
  (auth)/login|reset-password/  # Auth pages (route group, sin prefijo /auth)
  auth/callback/                # OAuth callback + promoción dueño → super_admin
  dashboard/                    # /dashboard/* : miembros, pagos, mis-pagos, reportar-pago,
                                # perfil, configuracion/ (config, notificaciones)
  api/                          # miembros, migracion, profile, pagos(+notify),
                                # notificaciones(+procesar), push/subscriptions,
                                # auth/ (forgot-password, reset-password, ensure-super-admin)
lib/
  supabase/                     # client.ts (browser, sync) · server.ts (async cookies) · middleware.ts
  features/                     # arquitectura objetivo (ver openspec/ROADMAP.md)
    pagos/                      # domain/ = cálculos puros (reciben hoy: Date) · service.ts = queries Supabase
    dashboard/carga.ts          # consultarDashboard (server-first) + mapearMiembros
    notificaciones/             # datos, frecuencia, ejecucion (cron+manual), reporte, horario
    push/                       # types, service (server, web-push), dispositivo (client)
  services/                     # legacy migrando a features/: auth, config, email, miembros, notificaciones
  messages.ts · types.ts · utils.ts   # i18n centralizado / interfaces / helpers
components/
  ui/                           # button, card, input, avatar, badge, modal, toast, loading-overlay, password-input
  push/                         # boton-suscripcion, auto-suscripcion, modal-activar-push, use-estado-push
  sidebar.tsx · providers.tsx · auth-footer.tsx · scroll-to-top.tsx
supabase/                       # migrations/ (manuales en SQL Editor) · functions/ (Deno) · local/ (schema local)
e2e/                            # 1 spec Playwright legacy — NO usar (los tests del proyecto son vitest)
__tests__/                      # helpers/supabase-fake.ts + tests: pagos.service/domain/delete-route,
                                # push.service/dispositivo, pagos-notify-eventos, notificaciones-ejecucion, migracion
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
- `.env.local` — lo que usa esta máquina: Supabase dev, GMAIL SMTP, `CRON_SECRET`, credenciales PostgreSQL local (lo leen `npm run dev` y `npm run build`).
- `.env.development` — override solo-dev (`next dev` lo lee, `next build` nunca). Ausente por defecto.
- `.env.development.local` — lo escribe `npm run db:local:reset`; gana sobre `.env.local` en dev.
- `.env.prod` — variables Supabase de producción; Next.js **no** lee ese nombre (busca `.env.production` / `.env.production.local`).

**Supabase** (dev en `.env.local`, producción en el env de Vercel): `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` (solo server, nunca al cliente) · `NEXT_PUBLIC_SITE_URL` (origen del callback) · `NEXT_PUBLIC_ADMIN_EMAIL` · `GMAIL_USER` · `GMAIL_APP_PASSWORD` (16 chars, no es tu password real).

**Cron** (producción; ausente = cron bloqueado): `CRON_SECRET` — bearer que Vercel Cron manda a `/api/notificaciones` (falta → 401 fail-closed). `CRON_ENABLED` — debe ser `"true"` para que el path con `CRON_SECRET` ejecute; cualquier otro valor lo bloquea (200, `ejecutadas: 0`, sin correos). Setealo **solo** en el proyecto Vercel de producción; en dev déjalo sin setear. Los runs manuales de super_admin lo ignoran.

**PostgreSQL local** (en `.env.local`): `LOCAL_DB_HOST` (localhost) · `LOCAL_DB_PORT` (6000) · `LOCAL_DB_USER` (postgres) · `LOCAL_DB_PASS` · `LOCAL_DB_NAME` (postgres).

## Database

Schema managed via numbered SQL files in `supabase/migrations/`. Run manually:
1. Go to Supabase Dashboard → SQL Editor
2. Paste migration content → Run

Tables: `profiles`, `membresias`, `pagos` (header), `detalle_pago` (detail per month/inscription), `pagos_historial` (old data), `gym_config`, `gym_config_payment_methods`, `migracion`, `notificacion_config`, `notificacion_log`, `password_reset_tokens`

RLS uses helper functions (`get_user_role()`, `get_user_tenant_id()`) with `SECURITY DEFINER` to avoid infinite recursion. **Never create RLS policies that query the same table directly.**

## Auth Flow

- **LOGIN RULE**: toda persona que haga login DEBE estar en `profiles` con `registered: true` y `activo: true` (o `activo: null`). Excepciones: `NEXT_PUBLIC_ADMIN_EMAIL` y `gym_config.owner_email` se auto-crean como `super_admin` si no existen.
- Trigger `handle_new_user` crea el profile en signup con `registered: false` por defecto → no puede logearse. Middleware redirige no autenticados a `/login`.
- Google OAuth: Supabase → Google → `/auth/callback?code=...` → `exchangeCodeForSession` → verifica `registered: true` → `/dashboard`. Email/password: `signInWithEmail` → `isAuthorizedUser` verifica `registered: true`.
- Password reset: `/api/auth/forgot-password` → token en `password_reset_tokens` → email Gmail SMTP → `/reset-password?token=xxx` → valida token + setea password.
- **Gym owner detection**: email == `gym_config.owner_email` → auto-crea profile `super_admin` con `registered: true`.
- **Email change**: cambiar `owner_email` en Config desactiva el profile anterior (`activo: false`) y crea el nuevo `super_admin` vía `ensure-super-admin` (sync auth.users).

## Super Admin (Dueño) — Gold Identity

- El dueño (`role === "super_admin"`) tiene efectos gold/neon (CSS `neon-gold`, `neon-admin-ring`, `admin-welcome-banner`), avatar con anillo dorado, banner "Bienvenido, Administrador" con crown y partículas flotantes; acceso total: reportar/aprobar pagos, miembros y config.
- Detección: `const isSuperAdmin = profile?.role === "super_admin";`
- Detalle visual completo: `docs/super-admin.md`.

## Mobile Bottom Nav

- Admin: 4 items (Dashboard, Pagos, Miembros, Config); miembro: 2 (Mis Pagos, Perfil); cada uno `flex-1`.
- `ScrollToTop` resetea el scroll en cambios de ruta; `pb-24` en el layout evita tapar la nav fija.

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
- Fuente de verdad de cada cifra (inscritos, deudores, al día, stats mensuales, meses pendientes): `openspec/specs/pagos/spec.md` → funciones puras en `lib/features/pagos/domain/`.
- **Pagos recientes**: solo aprobados, con fallback si falla el join a profiles.
- **Loading (perf)** — `/dashboard` server-first: `app/dashboard/page.tsx` (Server Component) crea el server client (cookies + anon key, **nunca** service role) y lanza `consultarDashboard(supabase, year)` **sin await**, pasando la promesa a `DashboardClient`. El cliente calcula **todas** las cifras en el navegador con la fecha local (`filtrarElegibles` + `pagosService.calcularDashboard`): **no moverlas al server** (Vercel corre en UTC y "mes actual"/día de cobro se correrían al final de mes). Cambios de año y modales van por `loadData` (browser); ambos caminos aplican estado con los mismos `aplicarPaso1`/`aplicarPaso2` — no divergir. Si el dato server es `null` (sesión/error) o el año difiere → fallback a `loadData`. Bench: 1934 → 238 ms, 15 → 2 requests (`scripts/bench-dashboard.mjs`).

### Miembros Stats
- Total card muestra `active/max` (ej. `11/80`) usando `gym_config.max_members`

### Payment Approval
- `aprobarPago()` marca `profiles.inscripcion_pagada = true` al aprobar inscripción (lee `detalle_pago.tipo_pago`); también lo aprueba super_admin; suspensión: `payment_type: "suspension"`, monto 0 → `aprobado`.

### Mis Pagos — Delete (trash) rules
- Grid ordenado por **`created_at` desc**; **solo el último registro** del miembro (mayor `created_at`, empate `id` desc) puede borrarse — máximo 1 bote por miembro, los no-últimos no se eliminan (ni admin).
- **Miembro**: solo su último y solo si `pendiente`. **Super admin**: el último de cualquier miembro, sin importar estatus.
- UI: `esUltimoRegistro()` en `app/dashboard/mis-pagos/page.tsx`; autoridad real: `DELETE /api/pagos`. Si el pago incluía inscripción, recalcula `profiles.inscription_amount_paid` (`calcularMontoInscripcionAprobado`). Tests: `__tests__/pagos-delete-route.test.ts`.

### Config Service
- `updateConfig()` limpia read-only (`id`, `created_at`, `updated_at`, `created_by`, `updated_by`) antes del update; si cambia `owner_email` → `ensure-super-admin` (crea/promueve + sync auth.users y desactiva el anterior).
- `saveMetodosPago()` = radio (1 solo activo global, índice único `idx_one_active_per_method`); versionado temporal por tipo (efectivo/bs/binance): filas viejas `effective_to`, nuevas `effective_to=null`; lanza errores (no los traga). `getMetodosPago()` solo `is_active=true`.
- Si `gym_config` estaba vacío (primer save), recarga la página para sync del sidebar.

### Member Creation / Profile Page
- POST `/api/miembros`: email obligatorio (sin username), maneja usuarios auth existentes, password aleatoria si vacía; no-Gmail exige password (validado en cliente).
- `/perfil` acepta `?user_id=<uuid>` (super_admin edita otros); cambio de password sync email a auth.users si difiere; LoadingOverlay mientras guarda.

### Messages (i18n)
- Todo texto de usuario pasa por `lib/messages.ts`; sin strings hardcodeados ni `console.*` en app/lib; rutas API importan `messages` para errores.

### Logo Management
- Upload → bucket `logos` + `gym_config.logo_url`; delete = trash icon-only + storage + `logo_url: ""`; fallback icono `Dumbbell`.

### Member Self-Migration
- Login → link "Ya soy miembro" → modal: buscar nombre (fuzzy: prefijo sin último char por palabra) → crear auth + profile + pagos + detalle_pago + inscripción; email de bienvenida al final.
- Requisitos: `gym_config` + método de pago activo con monto > 0; solo procesa registros `pagado` (→ aprobado) y `suspendido` de la tabla `migracion`.

## Known Issues / TODO

### Code Quality
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

Items ya resueltos (historial): `docs/historial-resuelto.md`.

## Referencia detallada (leer bajo demanda)

- `docs/notificaciones.md` — frecuencias, cron (`CRON_SECRET`/`CRON_ENABLED`), ejecución, log/purga, reportes, recordatorio y morosos
- `docs/push.md` — web push: fail-open, componentes, eventos de pago, push en el cron, VAPID, tests
- `docs/migraciones.md` — 001–061 aplicadas y qué hace cada una
- `docs/super-admin.md` — detalle visual gold del dueño
- `docs/historial-resuelto.md` — issues ya corregidos (historial)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
