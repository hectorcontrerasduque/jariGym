import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendPaymentDebtEmail,
  sendPaymentReminderEmail,
  sendAdminReminderEmail,
  sendAdminSummaryEmail,
  sendSystemStatusEmail,
  sleep,
} from "@/lib/services/email/email.service";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("*")
      .limit(1)
      .single();

    if (!gymConfig || !gymConfig.notificaciones_enabled) {
      return NextResponse.json({ ejecutadas: 0, enviados: 0, errores: 0 });
    }

    const body = await request.json().catch(() => ({}));
    const tipoFiltro = body?.tipo;

    let query = supabase
      .from("notificacion_config")
      .select("*")
      .eq("habilitado", true);
    if (tipoFiltro) {
      query = query.eq("tipo_notificacion", tipoFiltro);
    }
    const { data: configs } = await query;

    if (!configs || configs.length === 0) {
      return NextResponse.json({ ejecutadas: 0, enviados: 0, errores: 0 });
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

    return NextResponse.json({ ejecutadas, enviados, errores });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
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
  config: { id: string; tipo_notificacion: string; dias_previo: number },
  gymConfig: Record<string, unknown>
): Promise<{ miembrosNotificados: number; sinProblemas: boolean }> {
  try {
    let miembrosNotificados = 0;

    switch (config.tipo_notificacion) {
      case "miembros_deudores":
        miembrosNotificados = await procesarMiembrosDeudores(gymConfig);
        break;
      case "recordatorio_pago":
        miembrosNotificados = await procesarRecordatorioPago(config.dias_previo, gymConfig);
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

async function procesarMiembrosDeudores(gymConfig: Record<string, unknown>): Promise<number> {
  const nombreGym = (gymConfig.nombre_gym as string) || "GymApp";
  const logoUrl = gymConfig.logo_url as string | null;
  const direccion = gymConfig.direccion as string | null;

  const { data: miembros } = await supabase
    .from("profiles")
    .select("id, email, nombre_completo")
    .eq("role", "miembro")
    .eq("activo", true)
    .not("email", "is", null);

  if (!miembros || miembros.length === 0) return 0;

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  let count = 0;

  for (const miembro of miembros) {
    const { data: pagos } = await supabase
      .from("pagos")
      .select("id")
      .eq("usuario_id", miembro.id)
      .eq("mes_pagar", mesActual)
      .eq("anio_pagar", anioActual)
      .eq("estado", "aprobado")
      .limit(1);

    if (pagos && pagos.length > 0) continue;

    const { data: pagosPendientes } = await supabase
      .from("pagos")
      .select("mes_pagar, anio_pagar, monto")
      .eq("usuario_id", miembro.id)
      .in("estado", ["pendiente", "suspendido"]);

    if (!pagosPendientes || pagosPendientes.length === 0) continue;

    try {
      await sendPaymentDebtEmail(
        miembro.email!,
        miembro.nombre_completo,
        nombreGym,
        pagosPendientes.map((p) => ({ mes: p.mes_pagar, anio: p.anio_pagar, monto: p.monto })),
        pagosPendientes.reduce((sum, p) => sum + p.monto, 0),
        logoUrl,
        direccion
      );
      count++;
      await sleep(3000);
    } catch (error) {
      // Non-critical: silent
    }
  }

  return count;
}

async function procesarRecordatorioPago(diasPrevio: number, gymConfig: Record<string, unknown>): Promise<number> {
  const nombreGym = (gymConfig.nombre_gym as string) || "GymApp";
  const logoUrl = gymConfig.logo_url as string | null;
  const duenoEmail = gymConfig.dueno_email as string | null;
  const direccion = gymConfig.direccion as string | null;

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
      fechaVencimiento = new Date(ultimoPago.anio_pagar, ultimoPago.mes_pagar, 1);
    }

    const diasRestantes = Math.ceil(
      (fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasRestantes <= diasPrevio && diasRestantes >= 0) {
      try {
        await sendPaymentReminderEmail(
          miembro.email!,
          miembro.nombre_completo,
          nombreGym,
          diasRestantes,
          fechaVencimiento.toLocaleDateString("es-ES"),
          logoUrl,
          direccion
        );
        count++;
        await sleep(3000);
      } catch (error) {
        // Non-critical: silent
      }
    }
  }

  if (duenoEmail) {
    try {
      await sendAdminReminderEmail(duenoEmail, duenoEmail, nombreGym, [], logoUrl, direccion);
      count++;
    } catch (error) {
      // Non-critical: silent
    }
  }

  return count;
}

async function procesarResumenDueno(gymConfig: Record<string, unknown>): Promise<number> {
  const nombreGym = (gymConfig.nombre_gym as string) || "GymApp";
  const logoUrl = gymConfig.logo_url as string | null;
  const duenoEmail = gymConfig.dueno_email as string | null;
  const direccion = gymConfig.direccion as string | null;
  if (!duenoEmail) return 0;

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
    .in("estado", ["pendiente", "suspendido"])
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
    await sendAdminSummaryEmail(
      duenoEmail,
      nombreGym,
      {
        pagosAprobados: (pagosAprobados || []).length,
        pagosPendientes: (pagosPendientes || []).length,
        montoCobrado: (pagosAprobados || []).reduce((s, p) => s + p.monto, 0),
        montoPendiente: (pagosPendientes || []).reduce((s, p) => s + p.monto, 0),
        miembrosAlDia: miembrosActivos || 0,
        miembrosDeudores: 0,
        migraciones: migraciones || 0,
      },
      `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/pagos`,
      logoUrl,
      direccion
    );
    return 1;
  } catch (error) {
    return 0;
  }
}

async function procesarEstatusSistema(gymConfig: Record<string, unknown>): Promise<number> {
  const nombreGym = (gymConfig.nombre_gym as string) || "GymApp";
  const logoUrl = gymConfig.logo_url as string | null;
  const direccion = gymConfig.direccion as string | null;
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
    await sendSystemStatusEmail(
      destino,
      nombreGym,
      {
        totalMiembrosActivos: totalActivos || 0,
        totalMiembrosInactivos: totalInactivos || 0,
        pagosAprobadosMes: (pagosAprobadosMes || []).length,
        pagosPendientesMes: (pagosPendientesMes || []).length,
        montoRecaudadoMes: (pagosAprobadosMes || []).reduce((s, p) => s + p.monto, 0),
        montoPendienteMes: (pagosPendientesMes || []).reduce((s, p) => s + p.monto, 0),
        capacidad: totalActivos || 0,
        maxMiembros: (gymConfig.max_miembros as number) || 50,
        ultimoMiembroRegistrado: ultimoMiembro ? ultimoMiembro.nombre_completo : "N/A",
        ultimoPagoRegistrado: ultimoPago
          ? new Date(ultimoPago.created_at).toLocaleDateString("es-ES")
          : "N/A",
        migraciones: migraciones || 0,
      },
      logoUrl,
      direccion,
      erroresFormateados
    );
    return 1;
  } catch (error) {
    return 0;
  }
}
