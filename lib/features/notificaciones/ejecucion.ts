import { pagosService } from "@/lib/features/pagos/service";
import { getDiaCobro } from "@/lib/utils";
import { messages } from "@/lib/messages";
import {
  calcularEstatusSistema,
  calcularResumenDueno,
  etiquetaFrecuencia,
  pagosDelMes,
} from "./datos";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ejecución de los 4 tipos de notificación. Un solo módulo para el cron
 * (`app/api/notificaciones`) y el disparo manual
 * (`app/api/notificaciones/procesar`): así las dos rutas no divergen.
 */

export type ResultadoEjecucion = {
  /** Correos aceptados por el transporte SMTP. */
  enviados: number;
  /** Destinatarios que fallaron (el resto puede haberse enviado bien). */
  fallos: number;
};

export type ConfigNotificacion = {
  id: string;
  notification_type: string;
  days_before?: number | null;
  daily_frequency?: boolean;
  weekly_frequency?: boolean;
  biweekly_frequency?: boolean;
  monthly_frequency?: boolean;
};

/** Columnas de `gym_config` que usan las notificaciones (alias: Record compatible). */
export type GymConfigNotificaciones = {
  gym_name?: string | null;
  logo_url?: string | null;
  owner_email?: string | null;
  address?: string | null;
  billing_mode?: string | null;
};

export type OrigenEjecucion = "cron" | "manual";

// ─── PRESUPUESTO DE TIEMPO Y PAUSA ENTRE CORREOS ─────────────
/**
 * `maxDuration` de la ruta es 300 s; el lote se corta antes para no morir a
 * mitad de la lista y dejar envíos sin registrar.
 */
export const PRESUPUESTO_MS = 240_000;
const PAUSA_ENTRE_CORREOS_MS = 1000;

let pausaMs = PAUSA_ENTRE_CORREOS_MS;
let presupuesto: { inicio: number; limiteMs: number } | null = null;

export function iniciarPresupuesto(limiteMs: number = PRESUPUESTO_MS): void {
  presupuesto = { inicio: Date.now(), limiteMs };
}

/** Pausa entre correos (1 s en producción). Las pruebas la ponen en 0. */
export function configurarPausa(ms: number): void {
  pausaMs = Math.max(0, ms);
}

function sinPresupuesto(): boolean {
  return presupuesto !== null && Date.now() - presupuesto.inicio >= presupuesto.limiteMs;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pausaEntreCorreos(): Promise<void> {
  if (pausaMs > 0) await sleep(pausaMs);
}

// ─── FECHAS DEL RECORDATORIO ─────────────────────────────────
export type FechasRecordatorio = {
  /** Día en que se cobra el próximo ciclo. */
  cobro: Date;
  /** `cobro - days_before` (día en que empieza a enviar el aviso). */
  notificacion: Date;
};

/**
 * Ventana de envío del recordatorio: desde `cobro - días_previo` hasta el
 * propio día de cobro. Usa el próximo día de cobro real, así que funciona igual
 * con `billing_mode = dia_uno` (aviso fin de mes anterior para el cobro del 1)
 * que con `fecha_inscripcion`.
 */
export function fechasRecordatorio(
  fechaInscripcion: string,
  diasPrevio: number,
  modoCobro: "dia_uno" | "fecha_inscripcion",
  hoy: Date
): FechasRecordatorio {
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const mesActual = hoy.getMonth() + 1;

  let cobro: Date;
  const diaEsteMes = getDiaCobro(fechaInscripcion, mesActual, hoy.getFullYear(), modoCobro);
  const candidato = new Date(hoy.getFullYear(), hoy.getMonth(), diaEsteMes);
  if (candidato >= inicioHoy) {
    cobro = candidato;
  } else {
    const siguiente = new Date(hoy.getFullYear(), mesActual, 1);
    const diaSiguiente = getDiaCobro(
      fechaInscripcion,
      siguiente.getMonth() + 1,
      siguiente.getFullYear(),
      modoCobro
    );
    cobro = new Date(siguiente.getFullYear(), siguiente.getMonth(), diaSiguiente);
  }

  const notificacion = new Date(cobro);
  notificacion.setDate(notificacion.getDate() - diasPrevio);

  return { cobro, notificacion };
}

function diasHastaCobro(cobro: Date, hoy: Date): number {
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((cobro.getTime() - inicioHoy.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─── PROCESADORES ────────────────────────────────────────────
export async function ejecutarMiembrosDeudores(
  supabase: SupabaseClient,
  gymConfig: GymConfigNotificaciones
): Promise<ResultadoEjecucion> {
  const morosos = await pagosService.getMiembrosMorosos(undefined, supabase);
  const ownerEmail = gymConfig.owner_email?.toLowerCase();
  const { sendPaymentDebtEmail } = await import("@/lib/services/email/email.service");

  let enviados = 0;
  let fallos = 0;

  for (const miembro of morosos) {
    if (ownerEmail && miembro.email?.toLowerCase() === ownerEmail) continue;
    if (sinPresupuesto()) break;

    const deudasParaEmail = miembro.deudas.length > 0
      ? miembro.deudas
      : [
          {
            month_number: new Date().getMonth() + 1,
            year_number: new Date().getFullYear(),
            payment_amount: miembro.totalDeuda || 0,
          },
        ];

    try {
      await sendPaymentDebtEmail(
        miembro.email,
        miembro.full_name,
        gymConfig.gym_name || "GymApp",
        deudasParaEmail,
        miembro.totalDeuda,
        gymConfig.logo_url,
        gymConfig.address
      );
      enviados++;
    } catch {
      fallos++;
    }

    await pausaEntreCorreos();
  }

  return { enviados, fallos };
}

export async function ejecutarRecordatorioPago(
  supabase: SupabaseClient,
  config: ConfigNotificacion,
  gymConfig: GymConfigNotificaciones,
  forzar = false
): Promise<ResultadoEjecucion> {
  const nombreGym = gymConfig.gym_name || "GymApp";
  const duenoEmail = gymConfig.owner_email?.toLowerCase() || null;
  const modoCobro: "dia_uno" | "fecha_inscripcion" =
    gymConfig.billing_mode === "fecha_inscripcion" ? "fecha_inscripcion" : "dia_uno";
  const diasPrevio = config.days_before ?? 3;
  const hoy = new Date();

  // Último envío exitoso de ESTE tipo: evita repetir el aviso dentro del
  // mismo ciclo (antes el guard por mes calendario lo bloqueaba casi siempre).
  const ultimoEnvio = forzar ? null : await ultimoEnvioExitoso(supabase, config.id);

  const { data: miembros } = await supabase
    .from("profiles")
    .select("id, email, full_name, start_date")
    .in("role", ["miembro", "super_admin"])
    .eq("activo", true)
    .not("email", "is", null);
  if (!miembros || miembros.length === 0) return { enviados: 0, fallos: 0 };

  let candidatos = miembros.filter((m) => !m.email || m.email.toLowerCase() !== duenoEmail);
  if (candidatos.length === 0) return { enviados: 0, fallos: 0 };

  const idsCandidatos = candidatos.map((m) => m.id);
  const { data: libreRows } = await supabase
    .from("memberships")
    .select("user_id")
    .in("user_id", idsCandidatos)
    .eq("status", "activa")
    .is("end_date", null);

  const idsLibres = new Set((libreRows || []).map((r) => r.user_id));
  candidatos = candidatos.filter((m) => !idsLibres.has(m.id));
  if (candidatos.length === 0) return { enviados: 0, fallos: 0 };

  const { usuariosConPago } = await pagosDelMes(supabase, hoy.getMonth() + 1, hoy.getFullYear());

  const deudores = candidatos.filter((m) => {
    if (usuariosConPago.has(m.id)) return false;
    if (!m.start_date) return false;
    if (forzar) return true;

    const fechas = fechasRecordatorio(m.start_date, diasPrevio, modoCobro, hoy);
    if (ultimoEnvio && ultimoEnvio >= fechas.notificacion) return false;
    return hoy >= fechas.notificacion && hoy <= fechas.cobro;
  });
  if (deudores.length === 0) return { enviados: 0, fallos: 0 };

  const { sendPaymentReminderEmail, sendAdminReminderEmail } = await import(
    "@/lib/services/email/email.service"
  );

  let enviados = 0;
  let fallos = 0;

  for (const deudor of deudores) {
    if (sinPresupuesto()) break;

    const fechas = fechasRecordatorio(deudor.start_date!, diasPrevio, modoCobro, hoy);
    try {
      await sendPaymentReminderEmail(
        deudor.email!,
        deudor.full_name,
        nombreGym,
        forzar ? 0 : diasHastaCobro(fechas.cobro, hoy),
        fechas.cobro.toLocaleDateString("es-ES"),
        gymConfig.logo_url,
        gymConfig.address
      );
      enviados++;
    } catch {
      fallos++;
    }

    await pausaEntreCorreos();
  }

  if (duenoEmail && enviados > 0 && !sinPresupuesto()) {
    try {
      await sendAdminReminderEmail(
        gymConfig.owner_email!,
        gymConfig.owner_email!,
        nombreGym,
        deudores.map((d) => {
          const fechas = fechasRecordatorio(d.start_date!, diasPrevio, modoCobro, hoy);
          return {
            nombre: d.full_name,
            diasRestantes: forzar ? 0 : diasHastaCobro(fechas.cobro, hoy),
            fechaVencimiento: fechas.cobro.toLocaleDateString("es-ES"),
          };
        }),
        gymConfig.logo_url,
        gymConfig.address
      );
      enviados++;
    } catch {
      fallos++;
    }
  }

  return { enviados, fallos };
}

export async function ejecutarResumenDueno(
  supabase: SupabaseClient,
  gymConfig: GymConfigNotificaciones,
  config?: ConfigNotificacion
): Promise<ResultadoEjecucion> {
  if (!gymConfig.owner_email) throw new Error(messages.notificaciones.noDuenoEmail);

  const resumen = await calcularResumenDueno(supabase);
  const { sendAdminSummaryEmail } = await import("@/lib/services/email/email.service");

  await sendAdminSummaryEmail(
    gymConfig.owner_email,
    gymConfig.gym_name || "GymApp",
    resumen,
    `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
    gymConfig.logo_url,
    gymConfig.address,
    config ? etiquetaFrecuencia(config) : undefined
  );

  return { enviados: 1, fallos: 0 };
}

export async function ejecutarEstatusSistema(
  supabase: SupabaseClient,
  gymConfig: GymConfigNotificaciones
): Promise<ResultadoEjecucion> {
  const destino = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!destino) throw new Error(messages.notificaciones.sinEmailAdmin);

  const { metricas, errores } = await calcularEstatusSistema(supabase, gymConfig);
  const { sendSystemStatusEmail } = await import("@/lib/services/email/email.service");

  await sendSystemStatusEmail(
    destino,
    gymConfig.gym_name || "GymApp",
    metricas,
    gymConfig.logo_url,
    gymConfig.address,
    errores
  );

  return { enviados: 1, fallos: 0 };
}

/**
 * Último `sent_at` de un envío **exitoso** (null = nunca).
 * Lo usa el recordatorio para no repetir el aviso dentro del mismo ciclo.
 */
export async function ultimoEnvioExitoso(
  supabase: SupabaseClient,
  configId: string
): Promise<Date | null> {
  return ultimoRegistro(supabase, configId, true);
}

/**
 * Último intento registrado (éxito o error). Lo usa la comprobación de
 * frecuencia: un fallo también consume la ventana para no reintentar a diario
 * (y no inundar al admin con `error-report`).
 */
export async function ultimoIntento(
  supabase: SupabaseClient,
  configId: string
): Promise<Date | null> {
  return ultimoRegistro(supabase, configId, false);
}

async function ultimoRegistro(
  supabase: SupabaseClient,
  configId: string,
  soloExitosos: boolean
): Promise<Date | null> {
  let query = supabase
    .from("notification_log")
    .select("sent_at")
    .eq("notification_config_id", configId);
  if (soloExitosos) query = query.eq("no_issues", true);

  const { data } = await query
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.sent_at ? new Date(data.sent_at) : null;
}

// ─── DESPACHO + REGISTRO ─────────────────────────────────────
/** Ejecuta el tipo que corresponda. Lanza si algo falló (lo registra `ejecutarYRegistrar`). */
export async function ejecutarTipoNotificacion(
  supabase: SupabaseClient,
  config: ConfigNotificacion,
  gymConfig: GymConfigNotificaciones,
  forzar = false
): Promise<ResultadoEjecucion> {
  switch (config.notification_type) {
    case "miembros_deudores":
      return ejecutarMiembrosDeudores(supabase, gymConfig);
    case "recordatorio_pago":
      return ejecutarRecordatorioPago(supabase, config, gymConfig, forzar);
    case "resumen_dueno":
      return ejecutarResumenDueno(supabase, gymConfig, config);
    case "estatus_sistema":
      return ejecutarEstatusSistema(supabase, gymConfig);
    default:
      return { enviados: 0, fallos: 0 };
  }
}

/**
 * Ejecuta + escribe `notification_log` + avisa al admin si algo falló.
 *
 * Reglas de registro:
 * - Envío total (fallos = 0, enviados > 0) → log `no_issues: true`.
 * - Sin nada que enviar (0 y 0) → **no se escribe log**, para no consumir la
 *   ventana de frecuencia del tipo.
 * - Fallo parcial o excepción → log `no_issues: false` + `error-report` al admin.
 */
export async function ejecutarYRegistrar(
  supabase: SupabaseClient,
  config: ConfigNotificacion,
  gymConfig: GymConfigNotificaciones,
  opciones: { forzar?: boolean; userId?: string | null; origen: OrigenEjecucion }
): Promise<{ enviados: number; sinProblemas: boolean }> {
  try {
    const resultado = await ejecutarTipoNotificacion(
      supabase,
      config,
      gymConfig,
      opciones.forzar ?? false
    );

    if (resultado.fallos > 0) {
      const detalle = `${messages.notificaciones.envioParcial} (enviados: ${resultado.enviados}, fallos: ${resultado.fallos})`;
      await escribirLog(supabase, {
        configId: config.id,
        enviados: resultado.enviados,
        sinProblemas: false,
        detalle,
        userId: opciones.userId,
      });
      await avisarErrorAlAdmin(config, gymConfig, detalle, opciones.origen);
      return { enviados: resultado.enviados, sinProblemas: false };
    }

    if (resultado.enviados > 0) {
      await escribirLog(supabase, {
        configId: config.id,
        enviados: resultado.enviados,
        sinProblemas: true,
        userId: opciones.userId,
      });
    }

    return { enviados: resultado.enviados, sinProblemas: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await escribirLog(supabase, {
      configId: config.id,
      enviados: 0,
      sinProblemas: false,
      detalle: errorMsg,
      userId: opciones.userId,
    });
    await avisarErrorAlAdmin(config, gymConfig, errorMsg, opciones.origen);
    return { enviados: 0, sinProblemas: false };
  }
}

async function escribirLog(
  supabase: SupabaseClient,
  datos: {
    configId: string;
    enviados: number;
    sinProblemas: boolean;
    detalle?: string;
    userId?: string | null;
  }
): Promise<void> {
  await supabase.from("notification_log").insert({
    notification_config_id: datos.configId,
    members_notified: datos.enviados,
    no_issues: datos.sinProblemas,
    ...(datos.detalle ? { error_detail: datos.detalle } : {}),
    ...(datos.userId ? { created_by: datos.userId } : {}),
  });
}

async function avisarErrorAlAdmin(
  config: ConfigNotificacion,
  gymConfig: GymConfigNotificaciones,
  mensaje: string,
  origen: OrigenEjecucion
): Promise<void> {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail) return;

  try {
    const { sendErrorReportEmail } = await import("@/lib/services/email/email.service");
    await sendErrorReportEmail(
      adminEmail,
      gymConfig.gym_name || "GymApp",
      {
        paso:
          (origen === "manual" ? "Notificación manual: " : "Notificación: ") +
          config.notification_type,
        mensaje,
        timestamp: new Date().toLocaleString("es-ES"),
        contexto: { tipo: config.notification_type, config_id: config.id },
      },
      gymConfig.logo_url,
      gymConfig.address
    );
  } catch {
    // El error original ya quedó en notification_log; no hay nada más que hacer.
  }
}
