import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pagosService } from "@/lib/services/pagos/pagos.service";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("notificaciones_enabled, nombre_gym, logo_url, dueno_email, max_miembros, direccion")
      .limit(1)
      .single();

    if (!gymConfig || !gymConfig.notificaciones_enabled) {
      return NextResponse.json({
        success: true,
        message: "Notificaciones deshabilitadas",
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
        message: "No hay configuraciones habilitadas",
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
      const resultado = await ejecutarTipo(config, gymConfig);
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
  frecuencia_semanal: boolean;
  frecuencia_quincenal: boolean;
  frecuencia_mensual: boolean;
}): Promise<boolean> {
  const tieneFrecuencia =
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
  }
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
          gymConfig
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
  const morosos = await pagosService.getMiembrosMorosos();
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
  gymConfig: {
    nombre_gym: string | null;
    logo_url: string | null;
    dueno_email: string | null;
  }
): Promise<number> {
  const { data: miembros } = await supabase
    .from("profiles")
    .select("id, email, nombre_completo")
    .eq("role", "miembro")
    .eq("activo", true)
    .not("email", "is", null);

  if (!miembros || miembros.length === 0) return 0;

  const hoy = new Date();
  let count = 0;

  for (const miembro of miembros) {
    const { data: ultimoPago } = await supabase
      .from("pagos")
      .select("mes_pagar, anio_pagar")
      .eq("usuario_id", miembro.id)
      .eq("estado", "aprobado")
      .order("anio_pagar", { ascending: false })
      .order("mes_pagar", { ascending: false })
      .limit(1)
      .single();

    if (!ultimoPago) continue;

    let fechaVencimiento: Date;
    if (ultimoPago.mes_pagar === 12) {
      fechaVencimiento = new Date(ultimoPago.anio_pagar + 1, 0, 1);
    } else {
      fechaVencimiento = new Date(
        ultimoPago.anio_pagar,
        ultimoPago.mes_pagar,
        1
      );
    }

    const diasRestantes = Math.ceil(
      (fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasRestantes <= diasPrevio && diasRestantes >= 0) {
      try {
        const { sendPaymentReminderEmail } = await import(
          "@/lib/services/email/email.service"
        );
        await sendPaymentReminderEmail(
          miembro.email!,
          miembro.nombre_completo,
          gymConfig.nombre_gym || "GymApp",
          diasRestantes,
          fechaVencimiento.toLocaleDateString("es-ES"),
          gymConfig.logo_url
        );
        count++;
      } catch (error) {
        // Non-critical: silent
      }
    }
  }

  if (gymConfig.dueno_email) {
    try {
      const { sendAdminReminderEmail } = await import(
        "@/lib/services/email/email.service"
      );
      await sendAdminReminderEmail(
        gymConfig.dueno_email,
        gymConfig.dueno_email,
        gymConfig.nombre_gym || "GymApp",
        [],
        gymConfig.logo_url
      );
      count++;
    } catch (error) {
      // Non-critical: silent
    }
  }

  return count;
}

async function procesarResumenDueno(gymConfig: {
  nombre_gym: string | null;
  logo_url: string | null;
  dueno_email: string | null;
}): Promise<number> {
  if (!gymConfig.dueno_email) return 0;

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
      gymConfig.dueno_email,
      gymConfig.nombre_gym || "GymApp",
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
    return 0;
  }
}

async function procesarEstatusSistema(gymConfig: {
  nombre_gym: string | null;
  logo_url: string | null;
  max_miembros: number;
}): Promise<number> {
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
      gymConfig.nombre_gym || "GymApp",
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
    return 0;
  }
}
