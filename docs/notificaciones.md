# Notifications System (referencia)

Detalle completo de notificaciones. El resumen vive en `AGENTS.md`.

## Config (`notificacion_config` table)
4 types: `miembros_deudores`, `recordatorio_pago`, `resumen_dueno`, `estatus_sistema`
- Each has: `is_active`, `daily/weekly/biweekly/monthly_frequency`, `days_before`
- `notificaciones_enabled` in `gym_config` is the master toggle (shows/hides the section)
- `daily_frequency` = runs every day (requires daily cron trigger)

## Frequency semantics (calendar + lead)
- Target dates are **calendar-based**: daily = every day; weekly = **Monday**; biweekly = **15th and last day of the month**; monthly = **last day of the month**.
- `fecha_envio = fecha_objetivo − days_before` (`days_before` = "días de anticipación", form field on all 4 cards, `min 0 / max 30`, default 0; daily ignores it). Implemented by inverting the lead: `objetivo = hoyVet(hoy) + days_before` then testing `esLunes` / `esDia15oFinDeMes` / `esFinDeMes` on that UTC date (`frecuencia.ts`).
- Runs once per **VET day** (`mismoDiaVet`); a first run with no `notification_log` row runs even if today is not a target day. A failed target day just waits for the next cycle (no retry).
- All date params are raw `Date`s; VET (UTC−4) conversion happens only inside `hoyVet`/`mismoDiaVet` — never shift a date twice.
- **Debtors floor**: `MIN_DIAS_AVISO_DEUDA = 7` hardcoded in `frecuencia.ts` — applies in addition to the lead, only to `miembros_deudores` (re-mailing the same debtor daily hurts deliverability). No DB field.

## Billing Mode (`gym_config.billing_mode`)
- `"dia_uno"` (default): all members billed on the 1st of each month
- `"fecha_inscripcion"`: each member billed on their inscription day (adjusted for month length)
- Affects: `getDiaCobro()`, `getMiembrosMorosos()`, `procesarRecordatorioPago()`
- Configurable via UI: Notificaciones → Modo de cobro radio buttons

## Log (`notificacion_log` table)
- `id_notificacion_config` (FK), `miembros_notificados`, `sin_problemas`, `error_detalle`, `fecha_hora_envio`
- **Batch at the end, only if everything succeeded** + purge to the last 10 rows per type (`LIMITE_BITACORA`) — see Execution flow

## Execution flow
1. **Vercel Cron** (vercel.json): `GET /api/notificaciones` daily at `0 4 * * *` (UTC) = midnight Venezuela (UTC-4). Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically; if the env var is missing the endpoint fails closed (401). Admin JWT also works (but is treated as a manual run → no report). Hobby plan: min 1 run/day, may fire anywhere within the scheduled hour (frequency logic only compares dates).
   **Environment gate**: the `CRON_SECRET` path only executes when `CRON_ENABLED=true` (deny by default) — without it the route answers 200 with `message` + `ejecutadas: 0` and runs nothing. This keeps the **dev Vercel project** (its own `vercel.json` cron, also `VERCEL_ENV=production`) from emailing against debugging data. Set `CRON_ENABLED=true` in the **production** Vercel project (mandatory after this change, else the real cron is off). Manual calls with super_admin JWT and `/api/notificaciones/procesar` ignore the gate — they are explicit instructions.
   **The schedule lives only in `vercel.json`** — to test, edit `schedule` in UTC (15:00 VET → `0 19 * * *`) and push; `npx vercel crons run /api/notificaciones` or a manual `curl` with `CRON_SECRET` also work. The Notificaciones page only *displays* it (`horarioNotificaciones()` in `horario.ts`, info strip under the master toggle) — there is no DB field and no guard on it.
2. **Manual**: `POST /api/notificaciones/procesar` with admin JWT + `{ tipo?: string, forzar?: boolean }`
3. Route queries `notification_config WHERE is_active = true`, loops configs, checks `verificarFrecuencia(config, ultimoIntento)` — calendar target − `days_before` (manual route skips the frequency check; `forzar` bypasses the same-day dedup), calls `ejecutarCorrida()`
4. `ejecutarCorrida()` dispatches to `ejecutarMiembrosDeudores`, `ejecutarRecordatorioPago`, `ejecutarResumenDueno`, `ejecutarEstatusSistema`, all in `lib/features/notificaciones/ejecucion.ts`. Both routes share this module so they cannot diverge.
5. **Logging rules** (`ejecutarCorrida`): the `notification_log` batch is written **at the very end of the run and only when no type failed** — one row per config that executed with `enviados > 0` (`no_issues: true`, `created_by` when there is a user). Nothing is written when `0/0` (an empty run must not consume the frequency window); on any failure or exception **zero rows are written** (detail goes only to the report — accepted trade-off: the frequency windows of the *successful* types do not advance that day). Failures carry the real reason per recipient (`email — mensaje`) in `fallidosA`.
6. **Purge**: after logging, each config keeps only the **last 10 rows** (`LIMITE_BITACORA = 10`, max 40 rows total): select ids by `sent_at desc`, delete the rest with `.not("id", "in", ...)` when there are more than 10. Purge errors become warnings in the report, not failures.
7. **Run report (cron only)**: `reporte.ts` builds a plain-text report — schedule + VET window, per-template status/frequency/last attempt, recipients, coverage % (`enviados/activos`, 1 decimal, "—" when there are no active members), failures with reasons, warnings (purge), totals and a pie line — and emails it to `NEXT_PUBLIC_ADMIN_EMAIL` via `sendRunReportEmail` (text/plain, no HTML/QR/bulk headers). **Sent only when there is information**: `debeEnviarReporte()` requires `enviados > 0` **or** `errores > 0` **or** warnings **or** a fatal error — an all-skipped run (0/0, like the daily frequency gate) builds the text (it travels in the JSON response) but does not email (`reporte_enviado: false`, `reporte_omitido: "sin_informacion"`). **Never** for admin-JWT runs (`origen: "manual"`) nor for guard returns (cron disabled / notifications disabled / no configs). A fatal route error still emails a minimal report (`enviarReporteFatal`) when authenticated with `CRON_SECRET`; the 500 body is unchanged. Denominator = profiles with `activo IS NOT FALSE` (all roles).
8. `resumen_dueno` and `estatus_sistema` build their payloads in `lib/features/notificaciones/datos.ts` (`calcularResumenDueno`, `calcularEstatusSistema`, `etiquetaFrecuencia`). `ResumenDueno.montoPendiente` = sum of the month's pending payment amounts — distinct from `montoDeuda` (general morosos debt).
9. **Time budget**: `iniciarPresupuesto()` (240 s of the route's `maxDuration = 300`). The email throttle lives **only** in `email.service` (`EMAIL_DELAY_MS = 1500` ≈ 24 correos/min, cómodo contra límites de Gmail y su tope de 500/día); antes había además 1 s de pausa redundante en `ejecucion.ts` (eliminada). Order of execution (`ordenarConfigs()`): single-recipient types (`resumen_dueno`, `estatus_sistema`) first — nunca quedan "no ejecutadas por presupuesto" —, then `recordatorio_pago`, then `miembros_deudores`. Each member batch is capped by `limiteTipoPara()` (restante − 25 % × total × lotes pendientes siguientes), so a big batch cannot starve the next one; inside each batch recipients go by urgency (morosos: deuda descendente; recordatorio: cobro más próximo primero). A cut sets `presupuestoAgotado` + `sinEnviar` and the run report prints `Quedaron sin enviar: N (se atenderán en el próximo ciclo)` — lists rebuild every cycle, so the remainder is served next cycle (no double-send). Loops stop early instead of dying mid-list.

## Recordatorio de Pago
- `recordatorio_pago` uses per-member billing day logic only for the **content** of the email (billing day = day of inscription, or the 1st in `dia_uno` mode, adjusted for month length — `fechasRecordatorio()` called with lead 0)
- **When it sends** is decided uniformly by the frequency gate (`verificarFrecuencia`, calendar + `days_before`) — there is **no per-member window** anymore
- **Recipients**: every active member (minus the owner, minus open-ended active memberships) who **owes next month** (`pagosDelMes(mes+1)`), i.e. has no approved payment for next month
- **Dedup**: one send per VET day — skipped when the last successful log for that config is today; `forzar` skips the dedup and its log query
- No grace period: first billing month is inscription month
- Helper functions in `lib/utils.ts`: `getDiaCobro()`, `getDiaNotificacion()`, `esDiaDeNotificacion()` (used only to render the email)

## Miembros Morosos - Día de Cobro
- `getMiembrosMorosos()` uses `getDiaCobro()` to determine debt start
- First debt month = inscription month (no grace period)
- Current month only counted as debt if `hoy.getDate() >= diaCobro`
- **Debt notices are never sent more than once every 7 days** (`MIN_DIAS_AVISO_DEUDA` in `frecuencia.ts`), even if the type is configured as daily — re-mailing the same debtor daily hurts deliverability

## Dashboard trigger
- There is **no** automatic trigger from `/dashboard`: `procesarTodasLasNotificaciones()` is only called from the Notificaciones config page ("Ejecutar Todo" / "Ejecutar Ahora", both with `forzar: true`). The cron is the only unattended sender.

## Sidebar
- Notifications link at top level: `<SidebarItem icon={Bell} label="Notificaciones" href="/dashboard/configuracion/notificaciones" />`

## Per-type execution
- "Ejecutar Ahora" on a specific type sends `{ tipo: "miembros_deudores", forzar: true }` → API skips frequency, executes only that type
- The manual route **never** checks `verificarFrecuencia()`; `forzar: true` additionally bypasses the recordatorio dedup (sends to everyone who has not paid next month)
