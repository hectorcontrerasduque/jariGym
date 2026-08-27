import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { messages } from "@/lib/messages";
import { sleep } from "@/lib/services/email/email.service";
import { getDiaCobro, getDiaNotificacion } from "@/lib/utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CRON_SECRET = process.env.CRON_SECRET || "gym-notifications-cron-secret";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  // Accept either CRON_SECRET or admin user token
  let isCronAuth = authHeader === `Bearer ${CRON_SECRET}`;
  let isAdminAuth = false;

  if (!isCronAuth && authHeader) {
    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "super_admin" || profile?.role === "admin") {
        isAdminAuth = true;
      }
    }
  }

  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 401 });
  }

  try {
    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("notificaciones_enabled, nombre_gym, logo_url, dueno_email, max_miembros, direccion, modo_cobro")
      .limit(1)
      .single();

    if (!gymConfig || !gymConfig.notificaciones_enabled) {
      return NextResponse.json({
        success: true,
        message: messages.notificaciones.notificacionesDeshabilitadas,
        ejecutadas: 0,
      });
    }

    const { data: configs } = await supabase
      .from("notificacion_config")
      .select("*")
      .eq("habilitado", true);

    if (!configs || configs.length === 0) {
      return NextResponse.json({
        success: true,
        message: messages.notificaciones.noConfiguracionesHabilitadas,
        ejecutadas: 0,
      });
    }

    let ejecutadas = 0;
    let enviados = 0;
    let errores = 0;

    for (const config of configs) {
      const debeEjecutar = await verificarFrecuencia(config);
      if (!debeEjecutar) continue;

      ejecutadas++;
      const resultado = await ejecutarTipo(config, gymConfig, false);
      if (resultado.sinProblemas) {
        enviados += resultado.miembrosNotificados;
      } else {
        errores++;
      }
    }

    return NextResponse.json({
      success: true,
      ejecutadas,
      enviados,
      errores,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function verificarFrecuencia(config: {
  id: string;
  frecuencia_diaria: boolean;
  frecuencia_semanal: boolean;
  frecuencia_quincenal: boolean;
  frecuencia_mensual: boolean;
}): Promise<boolean> {
  const tieneFrecuencia =
    config.frecuencia_diaria ||
    config.frecuencia_semanal ||
    config.frecuencia_quincenal ||
    config.frecuencia_mensual;
  if (!tieneFrecuencia) return false;

  const { data: ultimoLog } = await supabase
    .from("notificacion_log")
    .select("fecha_hora_envio")
    .eq("id_notificacion_config", config.id)
    .order("fecha_hora_envio", { ascending: false })
    .limit(1)
    .single();

  if (!ultimoLog) return true;

  const ahora = new Date();
  const ultimoEnvio = new Date(ultimoLog.fecha_hora_envio);
  const diasDesdeUltimo =
    (ahora.getTime() - ultimoEnvio.getTime()) / (1000 * 60 * 60 * 24);

  if (config.frecuencia_diaria && diasDesdeUltimo >= 1) return true;
  if (config.frecuencia_semanal && diasDesdeUltimo >= 7) return true;
  if (config.frecuencia_quincenal && diasDesdeUltimo >= 15) return true;
  if (config.frecuencia_mensual && diasDesdeUltimo >= 30) return true;

  return false;
}

async function ejecutarTipo(
  config: {
    id: string;
    tipo_notificacion: string;
    dias_previo: number;
  },
  gymConfig: {
    nombre_gym: string | null;
    logo_url: string | null;
    dueno_email: string | null;
    max_miembros: number;
    direccion: string | null;
  },
  forzar: boolean = false
): Promise<{ miembrosNotificados: number; sinProblemas: boolean }> {
  try {
    let miembrosNotificados = 0;

    switch (config.tipo_notificacion) {
      case "miembros_deudores":
        miembrosNotificados = await procesarMiembrosDeudores(gymConfig);
        break;
      case "recordatorio_pago":
        miembrosNotificados = await procesarRecordatorioPago(
          config.dias_previo,
          gymConfig,
          forzar
        );
        break;
      case "resumen_dueno":
        miembrosNotificados = await procesarResumenDueno(gymConfig);
        break;
      case "estatus_sistema":
        miembrosNotificados = await procesarEstatusSistema(gymConfig);
        break;
    }

    await supabase.from("notificacion_log").insert({
      id_notificacion_config: config.id,
      miembros_notificados: miembrosNotificados,
      sin_problemas: true,
    });

    return { miembrosNotificados, sinProblemas: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await supabase.from("notificacion_log").insert({
      id_notificacion_config: config.id,
      miembros_notificados: 0,
      sin_problemas: false,
      error_detalle: errorMsg,
    });
    return { miembrosNotificados: 0, sinProblemas: false };
  }
}

async function procesarMiembrosDeudores(gymConfig: {
  nombre_gym: string | null;
  logo_url: string | null;
  direccion: string | null;
}): Promise<number> {
  const morosos = await pagosService.getMiembrosMorosos(undefined, supabase);
  if (morosos.length === 0) return 0;

  const { sendPaymentDebtEmail } = await import(
    "@/lib/services/email/email.service"
  );

  let count = 0;
  for (const miembro of morosos) {
    try {
      const deudasParaEmail = miembro.deudas.length > 0
        ? miembro.deudas
        : [{ mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), monto: miembro.totalDeuda || 0 }];

      await sendPaymentDebtEmail(
        miembro.email,
        miembro.nombre_completo,
        gymConfig.nombre_gym || "GymApp",
        deudasParaEmail,
        miembro.totalDeuda,
        gymConfig.logo_url,
        gymConfig.direccion
      );
      count++;
    } catch (error) {
      console.error(`[notificaciones] Error enviando deuda a ${miembro.email}:`, error);
    }
  }

  return count;
}

async function procesarRecordatorioPago(
  diasPrevio: number,
  gymConfig: Record<string, unknown>,
  forzar: boolean = false
): Promise<number> {
  const nombreGym = (gymConfig.nombre_gym as string) || "GymApp";
  const logoUrl = gymConfig.logo_url as string | null;
  const duenoEmail = gymConfig.dueno_email as string | null;
  const direccion = gymConfig.direccion as string | null;
  const modoCobro = (gymConfig.modo_cobro as "dia_uno" | "fecha_inscripcion") || "dia_uno";

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const hoy = new Date();

  if (!forzar) {
    const { data: configRecordatorio } = await supabase
      .from("notificacion_config")
      .select("id")
      .eq("tipo_notificacion", "recordatorio_pago")
      .maybeSingle();

    if (configRecordatorio) {
      const inicioMes = new Date(anioActual, mesActual - 1, 1).toISOString();
      const finMes = new Date(anioActual, mesActual, 0, 23, 59, 59).toISOString();
      const { data: logExistente } = await supabase
        .from("notificacion_log")
        .select("id")
        .eq("id_notificacion_config", configRecordatorio.id)
        .gte("fecha_hora_envio", inicioMes)
        .lte("fecha_hora_envio", finMes)
        .limit(1)
        .maybeSingle();

      if (logExistente) return 0;
    }
  }

  const { data: miembros } = await supabase
    .from("profiles")
    .select("id, email, nombre_completo, fecha_inscripcion")
    .in("role", ["miembro", "admin", "super_admin"])
    .eq("activo", true)
    .not("email", "is", null);

  if (!miembros || miembros.length === 0) return 0;

  let candidatos = miembros.filter((m) => m.email !== duenoEmail);

  candidatos = candidatos.filter((m) => {
    if (!m.fecha_inscripcion) return true;
    const fechaInsc = new Date(m.fecha_inscripcion);
    const diasDesdeInscripcion =
      (hoy.getTime() - fechaInsc.getTime()) / (1000 * 60 * 60 * 24);
    return diasDesdeInscripcion >= 30;
  });

  if (candidatos.length === 0) return 0;

  const idsCandidatos = candidatos.map((m) => m.id);
  const { data: libreRows } = await supabase
    .from("membresias")
    .select("usuario_id")
    .in("usuario_id", idsCandidatos)
    .is("fecha_fin", null);

  const idsLibres = new Set((libreRows || []).map((r) => r.usuario_id));
  candidatos = candidatos.filter((m) => !idsLibres.has(m.id));

  if (candidatos.length === 0) return 0;

  const { data: pagosMes } = await supabase
    .from("pagos")
    .select("usuario_id")
    .eq("mes_pagar", mesActual)
    .eq("anio_pagar", anioActual)
    .in("estado", ["aprobado", "suspendido"]);

  const usuariosConPago = new Set((pagosMes || []).map((p) => p.usuario_id));

  const deudores = candidatos.filter((m) => {
    if (usuariosConPago.has(m.id)) return false;
    if (!m.fecha_inscripcion) return false;

    if (forzar) return true;

    const diaCobro = getDiaCobro(m.fecha_inscripcion, mesActual, anioActual, modoCobro);
    const notif = getDiaNotificacion(diaCobro, diasPrevio, mesActual, anioActual);

    return hoy.getDate() === notif.dia &&
      hoy.getMonth() + 1 === notif.mes &&
      hoy.getFullYear() === notif.anio;
  });

  if (deudores.length === 0) return 0;

  let count = 0;
  for (const deudor of deudores) {
    try {
      const diaCobro = getDiaCobro(deudor.fecha_inscripcion!, mesActual, anioActual, modoCobro);
      const diasRestantesMes = diaCobro - hoy.getDate();

      const { sendPaymentReminderEmail } = await import(
        "@/lib/services/email/email.service"
      );
      await sendPaymentReminderEmail(
        deudor.email!,
        deudor.nombre_completo,
        nombreGym,
        forzar ? 0 : Math.max(0, diasRestantesMes),
        new Date(anioActual, mesActual, diaCobro).toLocaleDateString("es-ES"),
        logoUrl,
        direccion
      );
      count++;
      await sleep(3000);
    } catch (error) {
      console.error("[notificaciones] Error enviando recordatorio:", error);
    }
  }

  if (duenoEmail && count > 0) {
    try {
      const { sendAdminReminderEmail } = await import(
        "@/lib/services/email/email.service"
      );
      await sendAdminReminderEmail(
        duenoEmail,
        duenoEmail,
        nombreGym,
        deudores.map((d) => {
          const diaCobro = getDiaCobro(d.fecha_inscripcion!, mesActual, anioActual, modoCobro);
          return {
            nombre: d.nombre_completo,
            diasRestantes: forzar ? 0 : Math.max(0, diaCobro - hoy.getDate()),
            fechaVencimiento: new Date(anioActual, mesActual, diaCobro).toLocaleDateString("es-ES"),
          };
        }),
        logoUrl,
        direccion
      );
      count++;
    } catch (error) {
      console.error("[notificaciones] Error enviando recordatorio al dueño:", error);
    }
  }

  return count;
}

async function procesarResumenDueno(gymConfig: Record<string, unknown>): Promise<number> {
  if (!gymConfig.dueno_email) throw new Error(messages.notificaciones.noDuenoEmail);

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const { data: pagosAprobados } = await supabase
    .from("pagos")
    .select("monto")
    .eq("estado", "aprobado")
    .eq("mes_pagar", mesActual)
    .eq("anio_pagar", anioActual);

  const { data: pagosPendientes } = await supabase
    .from("pagos")
    .select("monto")
    .in("estado", ["pendiente", "suspendido", "suspendido_pendiente"])
    .eq("mes_pagar", mesActual)
    .eq("anio_pagar", anioActual);

  const { count: miembrosActivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "miembro")
    .eq("activo", true);

  const { count: migraciones } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "migrado");

  try {
    const { sendAdminSummaryEmail } = await import(
      "@/lib/services/email/email.service"
    );
    await sendAdminSummaryEmail(
      gymConfig.dueno_email as string,
      (gymConfig.nombre_gym as string) || "GymApp",
      {
        pagosAprobados: (pagosAprobados || []).length,
        pagosPendientes: (pagosPendientes || []).length,
        montoCobrado: (pagosAprobados || []).reduce(
          (sum, p) => sum + p.monto,
          0
        ),
        montoPendiente: (pagosPendientes || []).reduce(
          (sum, p) => sum + p.monto,
          0
        ),
        miembrosAlDia: miembrosActivos || 0,
        miembrosDeudores: 0,
        migraciones: migraciones || 0,
      },
      `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/pagos`,
      gymConfig.logo_url
    );
    return 1;
  } catch (error) {
    console.error("[notificaciones] Error enviando resumen al dueño:", error);
    return 0;
  }
}

async function procesarEstatusSistema(gymConfig: Record<string, unknown>): Promise<number> {
  const destino = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!destino) return 0;

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const { count: totalActivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("activo", true);

  const { count: totalInactivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("activo", false);

  const { data: pagosAprobadosMes } = await supabase
    .from("pagos")
    .select("monto")
    .eq("estado", "aprobado")
    .eq("mes_pagar", mesActual)
    .eq("anio_pagar", anioActual);

  const { data: pagosPendientesMes } = await supabase
    .from("pagos")
    .select("monto")
    .in("estado", ["pendiente", "suspendido"])
    .eq("mes_pagar", mesActual)
    .eq("anio_pagar", anioActual);

  const { data: ultimoMiembro } = await supabase
    .from("profiles")
    .select("nombre_completo, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: ultimoPago } = await supabase
    .from("pagos")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: erroresRecientes } = await supabase
    .from("notificacion_log")
    .select("id, fecha_hora_envio, error_detalle, notificacion_config(tipo_notificacion)")
    .eq("sin_problemas", false)
    .order("fecha_hora_envio", { ascending: false })
    .limit(10);

  const erroresFormateados = (erroresRecientes || []).map((e: any) => ({
    tipo: e.notificacion_config?.tipo_notificacion || "desconocido",
    fecha: new Date(e.fecha_hora_envio).toLocaleDateString("es-ES"),
    detalle: e.error_detalle || "Sin detalle",
  }));

  const { count: migraciones } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "migrado");

  try {
    const { sendSystemStatusEmail } = await import(
      "@/lib/services/email/email.service"
    );
    await sendSystemStatusEmail(
      destino,
      (gymConfig.nombre_gym as string) || "GymApp",
      {
        totalMiembrosActivos: totalActivos || 0,
        totalMiembrosInactivos: totalInactivos || 0,
        pagosAprobadosMes: (pagosAprobadosMes || []).length,
        pagosPendientesMes: (pagosPendientesMes || []).length,
        montoRecaudadoMes: (pagosAprobadosMes || []).reduce(
          (s, p) => s + p.monto,
          0
        ),
        montoPendienteMes: (pagosPendientesMes || []).reduce(
          (s, p) => s + p.monto,
          0
        ),
        capacidad: totalActivos || 0,
        maxMiembros: gymConfig.max_miembros,
        ultimoMiembroRegistrado: ultimoMiembro
          ? ultimoMiembro.nombre_completo
          : "N/A",
        ultimoPagoRegistrado: ultimoPago
          ? new Date(ultimoPago.created_at).toLocaleDateString("es-ES")
          : "N/A",
        migraciones: migraciones || 0,
      },
      gymConfig.logo_url,
      undefined,
      erroresFormateados
    );
    return 1;
  } catch (error) {
    console.error("[notificaciones] Error enviando email de estatus del sistema:", error);
    return 0;
  }
}
