# Web Push / push al navegador (referencia)

Detalle completo de push. El resumen vive en `AGENTS.md`.

Módulo aislado en `lib/features/push/` — los llamadores solo importan `service.ts` (servidor)
o `dispositivo.ts` (cliente); nunca al revés (`service.ts` importa `web-push`, que es Node-only).

## Reglas de oro (fail-open)
- **Nunca lanza excepciones**: siempre devuelve `ResultadoPush { enviados, fallos, omitido }`.
  Un fallo de push jamás corta correos, cron ni guardados, y **nunca** marca `hayFallo` en
  `ejecutarCorrida` (solo puede aportar advertencias).
- Orden de compuertas en cada envío: sin claves VAPID → `omitido: "sin_configurar"` (sin red);
  luego `gym_config.push_enabled = false` → `omitido: "deshabilitado"`; solo entonces se
  resuelven destinatarios y se envía.
- El permiso de notificación es **por dispositivo** (lo otorga el navegador de cada persona);
  el interruptor `push_enabled` solo habilita el canal en el servidor. iOS ≥16.4 además
  requiere "Agregar a pantalla de inicio" (fallback: correo).

## Componentes
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

## Eventos de pago (`POST /api/pagos/notify`)
- El cliente solo manda `{ pagoId }` (los 5 call sites: pagos aprobar/rechazar, reportar-pago,
  mis-pagos, botón "Notificar al administrador" de mis-pagos). La ruta **deriva el evento** con
  `derivarEventoPago(status, callerRole, esDueno)`
  (`lib/features/pagos/domain/notify`, puro + testeado) — nunca confía en un `action` del cliente:
  - **aprobado/rechazado** (solo super_admin) → **push al miembro**. Motivo de rechazo
    = `payments.payment_note` (lo escribe `rechazarPago`).
  - **aprobado + pago propio de un super_admin** → **push a los DEMÁS super_admin**
    (`propio_aprobado`, con `enviarPushAAdmins(..., { excluir: user.id })` — el creador
    **no** recibe su propio push). Aplica también a **auto-suspensiones**
    (`crearPagoSuspendido(..., "aprobado")`, monto Bs 0): la derivación ignora
    `payment_type`, solo mira status + rol + propiedad → todas las reglas de
    notificación aplican por igual a pagos tipo suspensión.
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

## Push en el cron de notificaciones
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
