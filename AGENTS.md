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
```

No test suite or typecheck command configured. No CI pipelines.

## Architecture

```
app/
  (auth)/login/     # Auth pages (route group, no /auth prefix)
  auth/callback/    # OAuth callback route handler
  dashboard/        # All app pages under /dashboard/*
    configuracion/
    miembros/
    pagos/
    reportar-pago/
lib/
  supabase/
    client.ts       # Browser client (createBrowserClient)
    server.ts       # Server client (async cookies())
    middleware.ts   # Auth guard middleware
  services/         # Service layer per domain (auth, pagos, miembros, config, notificaciones)
  types.ts          # All TypeScript interfaces
  utils.ts          # cn(), formatCurrency(), formatDate(), getMonthName()
components/
  ui/               # Reusable primitives (button, card, input, avatar, badge, modal)
  sidebar.tsx       # Desktop sidebar + mobile bottom nav
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
