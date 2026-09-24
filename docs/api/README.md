# API de GymApp

La referencia completa está en [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1): método, autenticación, parámetros, cuerpo, respuestas y errores de cada endpoint.

## Cómo verla

```bash
npm run docs:api:build   # genera docs/api/index.html (página navegable) y ábrela en el navegador
npm run docs:api:lint    # valida openapi.yaml contra el estándar OpenAPI
```

También se puede abrir `openapi.yaml` en VS Code (extensión "OpenAPI (Swagger) Editor") o pegarlo en https://editor.swagger.io.

## Cómo se mantiene al día

`__tests__/api-docs.test.ts` falla (y con él el pre-commit) si:
- se crea, borra o renombra un `app/api/**/route.ts` o uno de sus métodos sin actualizar `openapi.yaml`;
- una operación no tiene `operationId`, `summary`, `security` explícito (`[]` si es pública) o una respuesta de éxito;
- una referencia `$ref` o un esquema de seguridad no existe.

## Resumen

| Método | Ruta | Autenticación | Uso |
|---|---|---|---|
| GET | `/api/auth/confirm-email` | pública | Confirmar correo (enlace del email de bienvenida) |
| POST | `/api/auth/ensure-super-admin` | token super_admin o `CRON_SECRET` | Crear/promover al dueño |
| POST | `/api/auth/forgot-password` | pública | Enviar email de recuperación |
| POST | `/api/auth/reset-password` | pública (token del email) | Cambiar contraseña |
| GET | `/api/config/public` | pública ⚠️ | Config del gym y métodos de pago |
| POST | `/api/config` | sesión, admin completo | Guardar config y método de pago |
| POST | `/api/miembros` | sesión super_admin | Crear miembro |
| DELETE | `/api/miembros?id=` | sesión super_admin | Eliminar miembro sin pagos |
| POST | `/api/miembros/toggle-status` | sesión super_admin | Activar/desactivar miembro ⚠️ |
| POST | `/api/migracion` | pública | "Ya soy miembro": migrar datos del Excel |
| POST | `/api/migracion/search` | pública | Buscar nombres por migrar |
| GET | `/api/migracion/list` | pública ⚠️ | Listar personas de migración |
| GET | `/api/migracion/morosos?anio=` | pública ⚠️ | Morosos de migración |
| GET | `/api/migracion/pending` | pública | ¿Quedan personas por migrar? |
| GET | `/api/migracion/ping?email=` | pública ⚠️ | ¿Existe el email / ya migró? |
| POST | `/api/notificaciones` | `CRON_SECRET` o token super_admin ⚠️ | Cron diario de correos |
| POST | `/api/notificaciones/procesar` | token super_admin | "Ejecutar ahora" |
| POST | `/api/notificaciones/diagnostico` | token super_admin | Diagnóstico de correo |
| DELETE | `/api/pagos?id=` | sesión (admin o dueño del pago) | Eliminar pago |
| POST | `/api/pagos/notify` | sesión super_admin ⚠️ | Correo de pago aprobado/rechazado |
| PUT | `/api/profile` | sesión | Editar perfil |

⚠️ = hallazgo pendiente; detalle en la descripción del endpoint y en `openspec/ROADMAP.md` ("Hallazgos de la fase 8").
