import { pagosService } from "@/lib/features/pagos/service";
import { getDiaCobro } from "@/lib/utils";
import { messages } from "@/lib/messages";
import {
  calcularEstatusSistema,
  calcularResumenDueno,
  etiquetaFrecuencia,
  pagosDelMes,
} from "./datos";
import { verificarFrecuencia } from "./frecuencia";
import {
  asuntoReporte,
  contarMiembrosActivos,
  construirReporteCorrida,
  enviarReporteTexto,
  fechaVet,
  labelTipo,
  reporteATexto,
  type PlantillaEntrada,
} from "./reporte";
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
  /** Correos que se enviaron bien (para el reporte del cron). */
  enviadosA: string[];
  /** Correos que fallaron. */
  fallidosA: string[];
  /** El bucle se cortó por `PRESUPUESTO_MS` antes de agotar la lista. */
  presupuestoAgotado: boolean;
};

function resultadoVacio(): ResultadoEjecucion {
  return { enviados: 0, fallos: 0, enviadosA: [], fallidosA: [], presupuestoAgotado: false };
}

/** Entrada de `fallidosA` con el motivo real del fallo (para el reporte). */
function falloDestinatario(email: string, error: unknown): string {
  const motivo = error instanceof Error ? error.message : String(error);
  return `${email} — ${motivo}`;
}

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

  const res = resultadoVacio();

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
      res.enviados++;
      if (miembro.email) res.enviadosA.push(miembro.email);
    } catch (error) {
      res.fallos++;
      if (miembro.email) res.fallidosA.push(falloDestinatario(miembro.email, error));
    }

    await pausaEntreCorreos();
  }

  res.presupuestoAgotado = sinPresupuesto();
  return res;
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
  if (!miembros || miembros.length === 0) return resultadoVacio();

  let candidatos = miembros.filter((m) => !m.email || m.email.toLowerCase() !== duenoEmail);
  if (candidatos.length === 0) return resultadoVacio();

  const idsCandidatos = candidatos.map((m) => m.id);
  const { data: libreRows } = await supabase
    .from("memberships")
    .select("user_id")
    .in("user_id", idsCandidatos)
    .eq("status", "activa")
    .is("end_date", null);

  const idsLibres = new Set((libreRows || []).map((r) => r.user_id));
  candidatos = candidatos.filter((m) => !idsLibres.has(m.id));
  if (candidatos.length === 0) return resultadoVacio();

  const { usuariosConPago } = await pagosDelMes(supabase, hoy.getMonth() + 1, hoy.getFullYear());

  const deudores = candidatos.filter((m) => {
    if (usuariosConPago.has(m.id)) return false;
    if (!m.start_date) return false;
    if (forzar) return true;

    const fechas = fechasRecordatorio(m.start_date, diasPrevio, modoCobro, hoy);
    if (ultimoEnvio && ultimoEnvio >= fechas.notificacion) return false;
    return hoy >= fechas.notificacion && hoy <= fechas.cobro;
  });
  if (deudores.length === 0) return resultadoVacio();

  const { sendPaymentReminderEmail, sendAdminReminderEmail } = await import(
    "@/lib/services/email/email.service"
  );

  const res = resultadoVacio();

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
      res.enviados++;
      res.enviadosA.push(deudor.email!);
    } catch (error) {
      res.fallos++;
      res.fallidosA.push(falloDestinatario(deudor.email!, error));
    }

    await pausaEntreCorreos();
  }

  if (duenoEmail && res.enviados > 0 && !sinPresupuesto()) {
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
      res.enviados++;
      res.enviadosA.push(gymConfig.owner_email!);
    } catch (error) {
      res.fallos++;
      res.fallidosA.push(falloDestinatario(gymConfig.owner_email!, error));
    }
  }

  res.presupuestoAgotado = sinPresupuesto();
  return res;
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

  const res = resultadoVacio();
  res.enviados = 1;
  res.enviadosA.push(gymConfig.owner_email);
  return res;
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

  const res = resultadoVacio();
  res.enviados = 1;
  res.enviadosA.push(destino);
  return res;
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
 * Último intento registrado (hoy solo se registran corridas sin fallos; el
 * detalle de los fallos vive en el reporte de texto del cron). Lo usa la
 * comprobación de frecuencia.
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

// ─── DESPACHO + CORRIDA COMPLETA ─────────────────────────────
/** Ejecuta el tipo que corresponda. Lanza si algo falló (lo captura `ejecutarCorrida`). */
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
      return resultadoVacio();
  }
}

/** Filas de `notification_log` que se conservan por tipo (la tabla no crece). */
export const LIMITE_BITACORA = 10;

/**
 * Deja solo las últimas `limite` filas del tipo. Se llama al final de cada
 * corrida; el dedup de frecuencia siempre consulta la fila más reciente, así
 * que recortar por `sent_at desc` es seguro.
 */
export async function purgarBitacora(
  supabase: SupabaseClient,
  configId: string,
  limite: number = LIMITE_BITACORA
): Promise<void> {
  const { data } = await supabase
    .from("notification_log")
    .select("id")
    .eq("notification_config_id", configId)
    .order("sent_at", { ascending: false })
    .limit(limite);

  const ids = (data ?? []).map((r) => String((r as { id: string }).id));
  if (ids.length < limite) return;

  await supabase
    .from("notification_log")
    .delete()
    .eq("notification_config_id", configId)
    .not("id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
}

export type OpcionesCorrida = {
  configs: ConfigNotificacion[];
  gymConfig: GymConfigNotificaciones;
  forzar?: boolean;
  userId?: string | null;
  origen: OrigenEjecucion;
  /** El cron chequea la frecuencia de cada tipo; el disparo manual no. */
  respetarFrecuencia: boolean;
  /** Expresión de vercel.json, solo para el reporte. */
  expresionCron?: string | null;
};

export type ResumenCorrida = {
  ejecutadas: number;
  enviados: number;
  errores: number;
  /** Texto plano del reporte (solo corridas del cron; null en manuales). */
  reporteTexto: string | null;
  /** false = no pudo enviarse; null = no aplica (corrida manual). */
  reporteEnviado: boolean | null;
};

/**
 * Corrida completa de los tipos indicados.
 *
 * Reglas:
 * - **Bitácora**: al final, y solo si ningún tipo falló → 1 insert batch con
 *   las filas `no_issues: true` de los tipos que enviaron. Si algo falló no se
 *   escribe ninguna fila (el detalle viaja en el reporte del cron).
 * - **Retención**: cada tipo queda con `LIMITE_BITACORA` filas como máximo.
 * - **Reporte**: solo en corridas del cron (`origen: "cron"`), siempre al
 *   final, en texto plano al super admin técnico. Las manuales no lo envían.
 */
export async function ejecutarCorrida(
  supabase: SupabaseClient,
  opciones: OpcionesCorrida
): Promise<ResumenCorrida> {
  const inicio = Date.now();
  const advertencias: string[] = [];
  const entradas: PlantillaEntrada[] = [];
  let hayFallo = false;

  for (const config of opciones.configs) {
    const base = {
      configId: config.id,
      tipo: config.notification_type,
      label: labelTipo(config.notification_type),
      frecuencia: etiquetaFrecuencia(config),
      ultimoIntento: null as string | null,
      presupuestoAgotado: false,
    };

    if (opciones.respetarFrecuencia) {
      const fecha = await ultimoIntento(supabase, config.id);
      base.ultimoIntento = fecha ? fechaVet(fecha) : null;
      if (!verificarFrecuencia(config, fecha)) {
        entradas.push({
          ...base,
          estado: "saltada_frecuencia",
          enviados: 0,
          fallos: 0,
          destinatarios: [],
          fallidos: [],
          error: null,
        });
        continue;
      }
    }

    if (sinPresupuesto()) {
      entradas.push({
        ...base,
        estado: "presupuesto",
        enviados: 0,
        fallos: 0,
        destinatarios: [],
        fallidos: [],
        error: null,
      });
      continue;
    }

    try {
      const r = await ejecutarTipoNotificacion(
        supabase,
        config,
        opciones.gymConfig,
        opciones.forzar ?? false
      );
      const error =
        r.fallos > 0
          ? `${messages.notificaciones.envioParcial} (enviados: ${r.enviados}, fallos: ${r.fallos})`
          : null;
      if (error) hayFallo = true;
      entradas.push({
        ...base,
        estado: "ejecutada",
        enviados: r.enviados,
        fallos: r.fallos,
        destinatarios: r.enviadosA,
        fallidos: r.fallidosA,
        error,
        presupuestoAgotado: r.presupuestoAgotado,
      });
    } catch (error) {
      hayFallo = true;
      entradas.push({
        ...base,
        estado: "ejecutada",
        enviados: 0,
        fallos: 1,
        destinatarios: [],
        fallidos: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ejecutadas = entradas.filter((e) => e.estado === "ejecutada").length;
  const errores = entradas.filter(
    (e) => e.estado === "ejecutada" && (e.fallos > 0 || e.error)
  ).length;
  const enviados = entradas.reduce((suma, e) => suma + e.enviados, 0);

  // Bitácora: solo al final, y solo si la corrida fue limpia.
  if (!hayFallo) {
    const filas = entradas
      .filter((e) => e.estado === "ejecutada" && e.enviados > 0)
      .map((e) => ({
        notification_config_id: e.configId,
        members_notified: e.enviados,
        no_issues: true,
        ...(opciones.userId ? { created_by: opciones.userId } : {}),
      }));
    if (filas.length > 0) {
      await supabase.from("notification_log").insert(filas);
    }
  }

  for (const config of opciones.configs) {
    try {
      await purgarBitacora(supabase, config.id);
    } catch (error) {
      advertencias.push(
        `${messages.notificaciones.reporte.purga}: ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  let reporteTexto: string | null = null;
  let reporteEnviado: boolean | null = null;

  if (opciones.origen === "cron") {
    let miembrosActivos = 0;
    try {
      miembrosActivos = await contarMiembrosActivos(supabase);
    } catch (error) {
      advertencias.push(
        `${messages.notificaciones.reporte.miembrosActivos}: ` +
          (error instanceof Error ? error.message : String(error))
      );
    }

    const reporte = construirReporteCorrida({
      fecha: new Date(),
      origen: opciones.origen,
      expresionCron: opciones.expresionCron ?? null,
      duracionMs: Date.now() - inicio,
      miembrosActivos,
      plantillas: entradas,
      advertencias,
    });
    reporteTexto = reporteATexto(reporte);
    reporteEnviado = await enviarReporteTexto(
      asuntoReporte(reporte, opciones.gymConfig.gym_name || "GymApp"),
      reporteTexto
    );
  }

  return { ejecutadas, enviados, errores, reporteTexto, reporteEnviado };
}
