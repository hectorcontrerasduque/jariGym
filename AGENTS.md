# GymApp SaaS - AGENTS.md

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Auth, PostgreSQL, Storage, Edge Functions)
- **Tailwind CSS** with custom `gym-*` color palette
- Multi-tenant SaaS for gym management

## Commands

```bash
npm run dev        # dev server on localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm run test       # Vitest (single run)
npm run test:watch # Vitest (watch mode)
```

No CI pipelines.

## Architecture

```
app/
  (auth)/login/     # Auth pages (route group, no /auth prefix)
  auth/callback/    # OAuth callback route handler
  dashboard/        # All app pages under /dashboard/*
    configuracion/   # Gym config, logos, payment methods
    miembros/        # Member management (CRUD, toggle status, notas_admin)
    pagos/           # Payment list (super_admin), inline filter by member
    reportar-pago/   # Create payments (admin for others, miembro for self)
    mis-pagos/       # Miembro's own payment history
    perfil/          # Profile edit (supports ?user_id for super_admin)
  api/miembros/      # POST endpoint for creating members
  api/profile/       # PUT endpoint for profile updates (uses service role key)
lib/
  supabase/
    client.ts       # Browser client (createBrowserClient)
    server.ts       # Server client (async cookies())
    middleware.ts   # Auth guard middleware
  services/         # Service layer per domain (auth, pagos, miembros, config, notificaciones)
  types.ts          # All TypeScript interfaces
  utils.ts          # cn(), formatCurrency(), formatDate(), getMonthName()
  messages.ts       # Centralized i18n messages for all modules
components/
  ui/               # Reusable primitives (button, card, input, avatar, badge, modal)
  ui/toast.tsx      # showToast(message, type) + ToastContainer
  ui/loading-overlay.tsx  # LoadingOverlay component
  ui/password-input.tsx   # PasswordInput with eye toggle
  sidebar.tsx       # Desktop sidebar + mobile bottom nav
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

## Database

Schema managed via numbered SQL files in `supabase/migrations/`. Run manually:
1. Go to Supabase Dashboard → SQL Editor
2. Paste migration content → Run

Tables: `tenants`, `profiles`, `planes`, `membresias`, `pagos`, `gym_config`, `notificaciones_config`, `notificaciones_log`

RLS uses helper functions (`get_user_role()`, `get_user_tenant_id()`) with `SECURITY DEFINER` to avoid infinite recursion. **Never create RLS policies that query the same table directly.**

## Auth Flow

- Middleware redirects unauthenticated users to `/login`
- Google OAuth: Supabase → Google → `/auth/callback?code=...` → `exchangeCodeForSession` → redirect to `/dashboard`
- Email/password via `signInWithEmail`
- Trigger `handle_new_user` auto-creates `profiles` row on signup

## Style Conventions

- Use `gym-*` custom Tailwind colors (not raw hex values)
- Use `cn()` from `@/lib/utils` for conditional classes (wraps `clsx` + `tailwind-merge`)
- All pages are responsive: mobile gets bottom nav (via `sidebar.tsx`), desktop gets sidebar
- Component pattern: `"use client"` directive at top of client components
- Service classes instantiated as singletons (`export const pagosService = new PagosService()`)

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
notas_admin: string | null
inscripcion_pagada: boolean
inscripcion_fecha: string | null
```

### Dashboard Stats Logic
- **Inscritos**: From `pagos` table (approved payments with "inscripción" in notas) + `profile.inscripcion_pagada`
- **Deudores**: Active members (no libre, inscription paid) without approved payment for current month
- **Al día**: Active members with approved payment for current month
- **Pagos recientes**: Approved payments only, with fallback when profile join fails

### Payment Approval
- `aprobarPago()` now auto-updates `profiles.inscripcion_pagada = true` when approving inscription payments

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

## Known Issues / TODO

- [ ] No CI/CD pipelines
- [ ] No rate limiting on API routes
- [ ] Storage bucket `comprobantes` is private — need signed URLs for viewing
- [ ] `gym_config_metodos_pago` monto_mensual fallback hardcoded to 5 when config missing
- [ ] No confirmation modal for payment deletion (uses `confirm()`)
- [ ] No pagination on pagos/miembros lists
- [ ] No dark mode support
- [ ] No PWA / offline support
