# GymApp - Gestión de Gimnasio SaaS

Multi-tenant SaaS para gestión de gimnasio con Next.js 14, Supabase y Tailwind CSS.

## Requisitos

- Node.js 18+
- npm
- Cuenta de Supabase
- Cuenta de Gmail (para envío de emails)

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side) | `eyJ...` |
| `NEXT_PUBLIC_SITE_URL` | URL de tu app | `https://jarigym.vercel.app` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Email del admin inicial | `admin@gmail.com` |
| `GMAIL_USER` | Gmail para enviar emails | `tucorreo@gmail.com` |
| `GMAIL_APP_PASSWORD` | App Password de Gmail (16 chars) | `abcd efgh ijkl mnop` |

### 3. Gmail App Password

1. Ve a https://myaccount.google.com/security
2. Activa **Verificación en 2 pasos**
3. Ve a https://myaccount.google.com/apppasswords
4. Crea una App Password para "GymApp"
5. Copia la contraseña de 16 caracteres a `GMAIL_APP_PASSWORD`

### 4. Base de datos

En Supabase Dashboard → SQL Editor, ejecuta las migraciones en orden:

1. `supabase/migrations/001_initial_schema.sql`
2. ... (todas las migraciones numeradas)
3. `supabase/migrations/023_password_reset_tokens.sql`

### 5. Variables en Vercel

En Vercel Dashboard → Settings → Environment Variables, agrega:
- `GMAIL_USER` = tu Gmail
- `GMAIL_APP_PASSWORD` = tu App Password

### 6. Ejecutar

```bash
npm run dev
```

## Comandos

```bash
npm run dev        # Servidor de desarrollo
npm run build      # Build de producción
npm run start      # Iniciar en producción
npm run lint       # Verificar código
npm run test       # Ejecutar tests
```

## Estructura

```
app/
  (auth)/login/          # Login
  (auth)/reset-password/ # Reset de contraseña
  dashboard/             # Panel principal
  api/auth/              # Endpoints de autenticación
  api/miembros/          # CRUD de miembros
  api/profile/           # Actualización de perfil
lib/
  services/              # Lógica de negocio
  supabase/              # Clientes Supabase
  messages.ts            # Mensajes i18n
components/ui/           # Componentes reutilizables
supabase/migrations/     # Migraciones SQL
```

## Despliegue

1. Push a `main`
2. Vercel despliega automáticamente
3. Asegúrate de tener las env vars en Vercel
4. Ejecuta las migraciones en Supabase
