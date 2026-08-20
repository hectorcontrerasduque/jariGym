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
```

No CI pipelines. No Node.js in WSL — run npm from Windows PowerShell.

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
  api/miembros/      # POST endpoint for creating members
  api/profile/       # PUT endpoint for profile updates (uses service role key)
  api/auth/
    forgot-password/ # POST: generates token + sends email via Gmail SMTP
    reset-password/  # POST: validates token + sets new password
lib/
  supabase/
    client.ts       # Browser client (createBrowserClient)
    server.ts       # Server client (async cookies())
    middleware.ts   # Auth guard middleware
  services/
    auth/           # signIn, resetPassword, getProfile
    config/         # Config CRUD + dueno email promotion on change
    email/          # nodemailer Gmail SMTP service
    email/templates/ # HTML email templates (reset password)
    miembros/       # Miembros CRUD + stats
    pagos/          # Pagos CRUD + approval
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
```

## Critical: Supabase Client Pattern

Three separate clients exist for three contexts:
- **Browser**: `lib/supabase/client.ts` — `createBrowserClient()`, sync
- **Server**: `lib/supabase/server.ts` — `await createClient()`, **async** (uses `await cookies()`)
- **Middleware**: `lib/supabase/middleware.ts` — `createServerClient()`, sync

**Do not mix these up.** Server client is `async` — always `await` the call.

## Environment Variables

All in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — admin key (server-side only, never expose to client)
- `NEXT_PUBLIC_SITE_URL` — callback redirect origin
- `NEXT_PUBLIC_ADMIN_EMAIL` — initial admin email
- `GMAIL_USER` — Gmail address for sending password reset emails
- `GMAIL_APP_PASSWORD` — Gmail App Password (16 chars, NOT your real password)

## Database

Schema managed via numbered SQL files in `supabase/migrations/`. Run manually:
1. Go to Supabase Dashboard → SQL Editor
2. Paste migration content → Run

Tables: `tenants`, `profiles`, `planes`, `membresias`, `pagos`, `gym_config`, `notificaciones_config`, `notificaciones_log`, `password_reset_tokens`

RLS uses helper functions (`get_user_role()`, `get_user_tenant_id()`) with `SECURITY DEFINER` to avoid infinite recursion. **Never create RLS policies that query the same table directly.**

## Auth Flow

- **LOGIN RULE**: toda persona que haga login DEBE estar registrado en `profiles` con `registered: true` y `activo: true` (o `activo: null`). Excepciones: `NEXT_PUBLIC_ADMIN_EMAIL` y `gym_config.dueno_email` se auto-crean como `super_admin` si no existen.
- Trigger `handle_new_user` auto-creates `profiles` row on signup, pero con `registered: false` por defecto → no puede logearse
- Middleware redirects unauthenticated users to `/login`
- Google OAuth: Supabase → Google → `/auth/callback?code=...` → `exchangeCodeForSession` → verifica profile `registered: true` → redirect a `/dashboard`
- Email/password via `signInWithEmail` → `isAuthorizedUser` verifica profile `registered: true`
- Password reset: custom flow via `/api/auth/forgot-password` → token in `password_reset_tokens` → email via Gmail SMTP → `/reset-password?token=xxx` → validates token + sets new password
- **Gym owner detection**: Si el email coincide con `gym_config.dueno_email`, se auto-crea profile `super_admin` con `registered: true`
- **Email change**: Cuando se cambia `dueno_email` en Config, se desactiva profile anterior (`activo: false`) y se crea nuevo `super_admin` para el nuevo email

## Super Admin (Dueño) — Gold Identity

The gym owner (`super_admin` role) has distinct gold neon visual effects:
- **CSS**: `neon-gold` (gold text-shadow), `neon-admin-ring` (animated gold gradient ring around avatar), `admin-welcome-banner` (animated gold gradient background)
- **Sidebar**: Avatar with gold glow ring, gym logo with gold background `bg-gradient-to-br from-yellow-500/30 to-amber-600/30`, name in gold text
- **Dashboard**: Welcome banner "Bienvenido, Dueño" with crown emoji, floating gold particles
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
- Sticky title bar
- Escape key closes

### Profile Type
```ts
role: "super_admin" | "admin" | "miembro"
activo: boolean | null  // null = active
registered: boolean  // must be true to login (except admin/owner emails)
notas_admin: string | null
inscripcion_pagada: boolean
inscripcion_fecha: string | null
```

### Dashboard Stats Logic
- **Inscritos**: From `pagos` table (approved payments with "inscripción" in notas) + `profile.inscripcion_pagada`
- **Deudores**: Active members (no libre, inscription paid) without approved payment for current month
- **Al día**: Active members with approved payment for current month
- **Pagos recientes**: Approved payments only, with fallback when profile join fails

### Miembros Stats
- Total card shows `active/max` format (e.g. `11/80`) using `gym_config.max_miembros`

### Payment Approval
- `aprobarPago()` now auto-updates `profiles.inscripcion_pagada = true` when approving inscription payments
- Super admin can approve payments (not just regular admin)

### Config Service
- `updateConfig()` strips read-only fields (`id`, `created_at`, `updated_at`) before Supabase update
- When `dueno_email` changes, auto-promotes new email's profile to `super_admin`

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

## Known Issues / TODO

- [ ] No CI/CD pipelines
- [ ] No rate limiting on API routes (except forgot-password: 3/hour)
- [ ] Storage bucket `comprobantes` is private — need signed URLs for viewing
- [ ] `gym_config_metodos_pago` monto_mensual fallback hardcoded to 5 when config missing
- [ ] No confirmation modal for payment deletion (uses `confirm()`)
- [ ] No pagination on pagos/miembros lists
- [ ] No dark mode support
- [ ] No PWA / offline support
