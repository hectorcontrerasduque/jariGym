# GymApp - Gestión de Gimnasio SaaS

Multi-tenant SaaS para gestión de gimnasio con Next.js 14, Supabase y Tailwind CSS.

## Requisitos

- Node.js 18+
- npm
- Cuenta de Supabase
- Cuenta de Gmail (para envío de emails de reset)

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
4. `supabase/migrations/024_gym_config_public_read.sql`

### 5. Variables en Vercel

En Vercel Dashboard → Settings → Environment Variables, agrega:
- `GMAIL_USER` = tu Gmail
- `GMAIL_APP_PASSWORD` = tu App Password

### 6. Ejecutar

```bash
npm run dev
```

### 7. Configurar Cron de Notificaciones (cron-job.org)

Las notificaciones automáticas se disparan de dos formas:
1. **Cron externo**: llama al endpoint `/api/notificaciones` semanalmente
2. **Login de admin**: al hacer login, el sidebar dispara en background una verificación

Para configurar el cron externo con [cron-job.org](https://cron-job.org) (gratis):

1. Crea una cuenta en https://cron-job.org
2. Crea un nuevo cron job con estos settings:
   - **URL**: `https://TU-DOMINIO.vercel.app/api/notificaciones`
   - **Method**: `POST`
   - **Schedule**: `0 9 * * 1` (cada lunes a 9:00 AM)
   - **Headers**:
     ```
     Authorization: Bearer TU_CRON_SECRET
     Content-Type: application/json
     ```
3. Genera un `CRON_SECRET` aleatorio y agrégalo como env var en Vercel
4. Activa las notificaciones en **Configuración → Notificaciones** del dashboard

```bash
# Generar CRON_SECRET aleatorio (ejecutar una vez)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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
  (auth)/login/              # Login con logo/gym name
  (auth)/reset-password/     # Reset de contraseña (público)
  auth/callback/             # OAuth callback + gym owner detection
  dashboard/
    configuracion/           # Gym config, logos, métodos de pago, dueno
    miembros/                # CRUD miembros, stats con max_miembros
    pagos/                   # Lista de pagos (super_admin)
    reportar-pago/           # Crear pagos (admin/miembro)
    mis-pagos/               # Historial del miembro
    perfil/                  # Edición de perfil (?user_id para super_admin)
  api/miembros/              # POST crear miembros
  api/profile/               # PUT actualizar perfil
  api/auth/
    forgot-password/         # POST: genera token + envía email
    reset-password/          # POST: valida token + cambia contraseña
lib/
  services/
    email/                   # Servicio nodemailer (Gmail SMTP)
    email/templates/         # Templates HTML de emails
    auth/                    # signIn, resetPassword, etc.
    config/                  # Config CRUD + dueno email promotion
    pagos/                   # Pagos CRUD + aprobación
    miembros/                # Miembros CRUD + stats
  supabase/                  # Clientes Supabase (browser/server/middleware)
  messages.ts                # i18n centralizado
components/
  ui/                        # Button, Card, Input, Avatar, Badge, Modal, Toast
  sidebar.tsx                # Desktop sidebar + mobile bottom nav
  auth-footer.tsx            # Footer para páginas de auth
  scroll-to-top.tsx          # Scroll al top al cambiar de ruta
  providers.tsx              # Client wrapper
supabase/migrations/         # SQL migraciones (ejecutar manualmente)
```

## Super Admin (Dueño del Gym)

El dueño del gym se identifica automáticamente por email:
- El email configurado en `gym_config.dueno_email` obtiene rol `super_admin`
- Funciona con **cualquier dominio** de correo (no solo Gmail)
- Al cambiar el email en Config, el nuevo correo se promueve a super_admin automáticamente
- Identidad visual **gold/neon**: anillo dorado en avatar, banner de bienvenida con corona, nombre con efecto neon dorado
- Acceso total: puede reportar pagos, aprobarlos, gestionar miembros y configuración

## Despliegue

1. Push a `main`
2. Vercel despliega automáticamente
3. Asegúrate de tener las env vars en Vercel
4. Ejecuta las migraciones en Supabase
