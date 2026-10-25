# GymApp - Gestión de Gimnasio SaaS

Multi-tenant SaaS para gestión de gimnasio con Next.js 16 (App Router), Supabase y Tailwind CSS.

## Requisitos

- Node.js 20.9+ (Next 16 no arranca por debajo)
- npm
- Cuenta de Supabase
- Cuenta de Gmail (para envío de emails de reset)

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia el ejemplo a `.env.local` — es el archivo que leen `npm run dev` **y** `npm run build`:

```bash
cp .env.example .env.local
```

> `.env.development` solo lo lee `next dev`. Durante `next build` Next.js usa `NODE_ENV=production` y nunca abre ese archivo, así que si guardas ahí las variables de Supabase el build fallará. Usa `.env.local` (o `.env.production` en producción).

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side) | `eyJ...` |
| `NEXT_PUBLIC_SITE_URL` | URL de tu app | `https://jarigym.vercel.app` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Email del admin inicial | `admin@gmail.com` |
| `GMAIL_USER` | Gmail para enviar emails | `tucorreo@gmail.com` |
| `GMAIL_APP_PASSWORD` | App Password de Gmail (16 chars) | `abcd efgh ijkl mnop` |
| `CRON_SECRET` | Secret for cron job auth (generate once) | random hex string |
| `CRON_ENABLED` | `"true"` solo en producción; bloquea el cron en dev | `true` |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` | Clave pública VAPID de Web Push (`npx web-push generate-vapid-keys`) | `BI8JSVP4...` |
| `WEB_PUSH_PRIVATE_KEY` | Clave privada VAPID (solo server; tipo Secret en Vercel) | `w4Rwu825...` |

> Sin las claves VAPID el resto de la app funciona igual: el canal de push se omite
> silenciosamente (`omitido: "sin_configurar"`). Para activarlo: genera las claves,
> ponlas en `.env.local` / Vercel, aplica la migración `058_push_subscriptions.sql`
> en el SQL Editor y enciende **Push al Celular** en Notificaciones.

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
5. `supabase/migrations/029_notificaciones_global.sql`

### 5. Variables en Vercel

En Vercel Dashboard → Settings → Environment Variables, agrega las variables de la tabla del paso 2
(`NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_*`) y las del cron (`CRON_SECRET`, `CRON_ENABLED=true`)
— estas últimas solo en el entorno **Production** del proyecto de producción; ver detalle en el paso 8.

`.env.local` no se sube al repo, así que el build de Vercel no tiene credenciales de Supabase ni de SMTP sin ellas.

### 6. Google OAuth (Login con Google)

El login con Google utiliza **Google Cloud Console** con un proyecto llamado **jariGym**.

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Selecciona el proyecto **jariGym**
3. Ve a **APIs & Services → Credentials**
4. En **OAuth 2.0 Client IDs**, encuentra el client ID que usa Supabase
5. En **Authorized redirect URIs**, asegúrate de tener:
   - `https://uymlacysgbpmfmkidbzy.supabase.co/auth/v1/callback` (producción)
   - `https://szcxzabtrpdzwmaevsbh.supabase.co/auth/v1/callback` (desarrollo)
6. En **Supabase Dashboard → Authentication → Providers → Google**, copia el Client ID y Client Secret de Google Cloud
7. En **Supabase Dashboard → Authentication → URL Configuration**, agrega las Redirect URLs de tu app:
   - `https://jarigym.vercel.app/auth/callback` (producción)
   - `https://jarigym-dev.vercel.app/auth/callback` (desarrollo)

### 7. Ejecutar

```bash
npm run dev
```

### 8. Cron de Notificaciones (Vercel Cron)

Las notificaciones automáticas se envían solo por **Vercel Cron**: `vercel.json` invoca
`GET /api/notificaciones` diariamente a las 04:00 UTC (medianoche VET). No se necesita ningún servicio
externo. El único disparo manual es desde **Configuración → Notificaciones** del dashboard
("Ejecutar Todo" / "Ejecutar Ahora"), que ignora el gate de entorno.

#### Variables obligatorias (Vercel → Settings → Environment Variables, entorno **Production**)

| Variable | Valor | Si falta |
|----------|-------|----------|
| `CRON_SECRET` | hex aleatorio (ver abajo), tipo **Secret** — nunca Config: el tipo Config muestra el valor en el dashboard y Vercel avisa "Needs Attention" | cron responde **401**, no corre nada (fail-closed) |
| `CRON_ENABLED` | `true` (exactamente; cualquier otro valor la bloquea) | responde 200 con `ejecutadas: 0`, no envía nada |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | credenciales SMTP de Gmail | la corrida corre pero **0 envíos** con errores |
| `NEXT_PUBLIC_ADMIN_EMAIL` | email del dueño | no llega el correo de reporte de corrida |

Vercel envía `CRON_SECRET` automáticamente como `Authorization: Bearer <CRON_SECRET>` al invocar el cron.

```bash
# Generar CRON_SECRET aleatorio (ejecutar una vez)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Checklist de configuración (producción, jargym)

1. Genera el `CRON_SECRET` con el comando de arriba.
2. En Vercel (proyecto **jargym**) → Settings → Environment Variables, crea `CRON_SECRET` (entorno
   **Production**, tipo **Secret**) y `CRON_ENABLED=true` (entorno **Production**).
3. **Redeploya la producción** — Vercel solo aplica cambios de env vars en el siguiente deploy; sin
   redeploy el cron sigue fallando aunque las variables estén bien.
4. Verifica en **Cron Jobs** que el job `GET /api/notificaciones` aparezca listado tras el deploy.

#### Probar sin esperar al schedule

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://jarigym.vercel.app/api/notificaciones
```

| Respuesta | Significado |
|-----------|-------------|
| `401` | `CRON_SECRET` no coincide (o no existe en el entorno) |
| `200` + mensaje "Cron no ejecutado: deshabilitado en este entorno" | falta `CRON_ENABLED=true` |
| `200` + `ejecutadas: 0` + "deshabilitadas/sin configuraciones" | `notifications_enabled` en Config está en off, o no hay tipos activos |
| `200` + `reporte_omitido: "sin_informacion"` | **Éxito**: corrió, pero todo se saltó por frecuencia (no es día objetivo) |
| `200` + `enviados > 0` | **Éxito**: envió correos |

Alternativa con Vercel CLI: `npx vercel crons run /api/notificaciones` (desde la raíz del repo, con la
CLI autenticada y apuntando al proyecto de producción).

#### Diagnosticar si "no dispara"

- **Vercel → Cron Jobs**: historial de invocaciones con status y duración por corrida — es la fuente más
  directa (un `401` allí = secret faltante/mal copiado; un `200` con `ejecutadas: 0` = gate o config).
- **Observability → Logs**: filtra por request path `/api/notificaciones`. No confundas con tráfico de
  páginas: un `GET /dashboard/...` con status `304` es una visita normal de navegador (cache revalidado),
  no el cron.
- El cron solo corre en deployments de **Production** (no en previews).

> **Desarrollo vs producción**: `vercel.json` es el mismo en ambas ramas, así que el cron se registra en los dos
> proyectos Vercel (jargym-dev y jargym; el dominio de prod es jarigym.vercel.app). El gate `CRON_ENABLED` evita que jargym-dev ejecute nada aunque el
> job se dispare a las 04:00 UTC (la ruta responde 200 con `ejecutadas: 0`). Define `CRON_ENABLED=true` **solo
> en jargym**; en jargym-dev déjala sin definir. Como capa extra puedes desactivarlo en jargym-dev: Cron Jobs →
> toggle del job `GET /api/notificaciones` → Disabled, o borrar `CRON_SECRET` de jargym-dev (recibiría 401).
> Las ejecuciones manuales con JWT de super_admin y `/api/notificaciones/procesar` ignoran el gate.

El reporte de corrida que llega a `NEXT_PUBLIC_ADMIN_EMAIL` **solo se envía cuando hay información**
(envíos, errores, advertencias o fallo fatal); una corrida donde todos los tipos se saltan por frecuencia
no genera correo (el texto queda en la respuesta JSON con `reporte_omitido: "sin_informacion"`).

En plan Hobby el mínimo es 1 ejecución/día (este cron es diario) y Vercel puede ejecutarlo en cualquier
punto dentro de la hora programada; la lógica de frecuencia del endpoint solo compara fechas, así que no afecta.

Activa las notificaciones en **Configuración → Notificaciones** del dashboard y selecciona la frecuencia
deseada por tipo:
   - **Diaria**: se ejecuta todos los días (si el cron corre diariamente)
   - **Semanal**: se ejecuta una vez por semana
   - **Quincenal**: se ejecuta cada 15 días
   - **Mensual**: se ejecuta una vez al mes

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
    configuracion/notificaciones/  # Notification config (4 types, per-type toggle, Ejecutar Ahora)
    miembros/                # CRUD miembros, stats con max_miembros
    pagos/                   # Lista de pagos (super_admin)
    reportar-pago/           # Crear pagos (admin/miembro)
    mis-pagos/               # Historial del miembro
    perfil/                  # Edición de perfil (?user_id para super_admin)
  api/miembros/              # POST crear miembros
  api/migracion/             # POST: migrate member data from Excel, search, ping
  api/profile/               # PUT actualizar perfil
  api/notificaciones/        # Cron + manual trigger
    route.ts                 # GET/POST: cron dispatch (CRON_SECRET or admin token)
    procesar/route.ts        # POST: admin-triggered, forzar bypasses frequency
  api/auth/
    forgot-password/         # POST: genera token + envía email
    reset-password/          # POST: valida token + cambia contraseña
lib/
  services/
    email/                   # Servicio nodemailer (Gmail SMTP)
    email/templates/         # Templates HTML de emails
    auth/                    # signIn, resetPassword, etc.
    config/                  # Config CRUD + dueno email promotion
    pagos/                   # Pagos CRUD + aprobación + getMiembrosMorosos
    miembros/                # Miembros CRUD + stats
    notificaciones/          # Notification service (procesarTodasLasNotificaciones)
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

## Super Admin — Sub-roles

El rol `super_admin` se subdivide en 3 niveles, determinados automáticamente por email:

| Nivel | Determinado por | Cantidad |
|-------|----------------|----------|
| **Propietario** | Email = `gym_config.owner_email` | Máx 1 |
| **Técnico** | Email = `NEXT_PUBLIC_ADMIN_EMAIL` (.env) | Máx 1 |
| **Normal** | Cualquier otro super_admin | Sin límite |

### Permisos por nivel

| Funcionalidad | Propietario | Técnico | Normal |
|---------------|:-----------:|:-------:|:------:|
| Dashboard completo | ✅ | ✅ | ✅ |
| Tarjeta Membresía Libre | ✅ | ✅ | ❌ |
| Página Configuración | ✅ | ✅ | ❌ |
| Modificar config (API) | ✅ | ✅ | ❌ |
| Botón Gestionar en Miembros | ✅ | ✅ | ❌ |
| Cambiar roles de usuarios | ✅ | ✅ | ❌ |
| Aprobar/rechazar pagos | ✅ | ✅ | ✅ |
| Gestionar miembros (CRUD) | ✅ | ✅ | ✅ |
| Notificaciones | ✅ | ✅ | ✅ |
| Identidad visual gold/neon | ✅ | ✅ | ✅ |

### Identidad visual

Todos los super_admin comparten:
- Anillo dorado en avatar (sidebar)
- Banner de bienvenida "Bienvenido, Administrador" con corona
- Nombre con efecto neon dorado

### Flujo de autenticación

- `NEXT_PUBLIC_ADMIN_EMAIL` y `gym_config.owner_email` se auto-crean como `super_admin` si no existen
- Al cambiar `owner_email` en Config, se desactiva el perfil anterior y se crea uno nuevo para el nuevo email
- Máx 1 propietario y 1 técnico: si ya existe uno con ese nivel, se bloquea el segundo

## Despliegue

1. Push a `main`
2. Vercel despliega automáticamente
3. Asegúrate de tener las env vars en Vercel
4. Ejecuta las migraciones en Supabase

## Migración de Base de Datos

Para sincronizar la base de datos entre entornos (prod, dev, local):

```bash
# Migración completa (estructura + datos + auth + GRANTS + storage)
.\db\migrate-db-new.ps1
```

Soporta: Prod ↔ Dev, Prod/Dev → Local, Local → Prod/Dev/Respaldo.

El script ejecuta:
1. `pg_dump` del origen (schema public + auth)
2. `DROP SCHEMA public CASCADE` en destino
3. `pg_restore` de estructura y datos
4. Importa `auth.users` via CSV (método confiable)
5. Aplica GRANT permissions para PostgREST
6. Recrea storage buckets y policies
7. Recrea foreign key constraints
8. Verifica integridad (tablas, FK, auth.users, GRANTS, storage)
