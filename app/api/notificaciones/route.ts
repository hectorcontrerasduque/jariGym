import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { messages } from "@/lib/messages";
import { sleep } from "@/lib/services/email/email.service";
import { getDiaCobro, getDiaNotificacion } from "@/lib/utils";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CRON_SECRET = process.env.CRON_SECRET || "gym-notifications-cron-secret";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  // Accept either CRON_SECRET or admin user token
  const isCronAuth = authHeader === `Bearer ${CRON_SECRET}`;
  let isAdminAuth = false;
  let userId: string | null = null;

  if (!isCronAuth && authHeader) {
    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (user) {
      userId = user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "super_admin") {
        isAdminAuth = true;
      }
    }
  }

  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 401 });
  }

  if (userId) {
    const rateLimitResponse = await applyRateLimit(request, {
      max: 5,
      windowMs: 20 * 60 * 1000,
      prefix: "auth",
    }, userId);
    if (rateLimitResponse) return rateLimitResponse;
  }

  try {
    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("notificaciones_enabled, gym_name, logo_url, owner_email, max_members, address, billing_mode")
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
      .from("notification_config")
      .select("*")
      .eq("is_active", true);

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
      const resultado = await ejecutarTipo(config, gymConfig, false, userId);
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
  daily_frequency: boolean;
  weekly_frequency: boolean;
  biweekly_frequency: boolean;
  monthly_frequency: boolean;
}): Promise<boolean> {
  const tieneFrecuencia =
    config.daily_frequency ||
    config.weekly_frequency ||
    config.biweekly_frequency ||
    config.monthly_frequency;
  if (!tieneFrecuencia) return false;

  const { data: ultimoLog } = await supabase
    .from("notification_log")
    .select("sent_at")
    .eq("notification_config_id", config.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  if (!ultimoLog) return true;

  const ahora = new Date();
  const ultimoEnvio = new Date(ultimoLog.sent_at);
  const diasDesdeUltimo =
    (ahora.getTime() - ultimoEnvio.getTime()) / (1000 * 60 * 60 * 24);

  if (config.daily_frequency && diasDesdeUltimo >= 1) return true;
  if (config.weekly_frequency && diasDesdeUltimo >= 7) return true;
  if (config.biweekly_frequency && diasDesdeUltimo >= 15) return true;
  if (config.monthly_frequency && diasDesdeUltimo >= 30) return true;

  return false;
}

async function ejecutarTipo(
  config: {
    id: string;
    notification_type: string;
    days_before: number;
  },
  gymConfig: {
    gym_name: string | null;
    logo_url: string | null;
    owner_email: string | null;
    max_members: number;
    address: string | null;
  },
  forzar: boolean = false,
  userId: string | null = null
): Promise<{ miembrosNotificados: number; sinProblemas: boolean }> {
  try {
    let miembrosNotificados = 0;

    switch (config.notification_type) {
      case "miembros_deudores":
        miembrosNotificados = await procesarMiembrosDeudores(gymConfig);
        break;
      case "recordatorio_pago":
        miembrosNotificados = await procesarRecordatorioPago(
          config.days_before,
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

    await supabase.from("notification_log").insert({
      notification_config_id: config.id,
      members_notified: miembrosNotificados,
      no_issues: true,
      created_by: userId,
    });

    return { miembrosNotificados, sinProblemas: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await supabase.from("notification_log").insert({
      notification_config_id: config.id,
      members_notified: 0,
      no_issues: false,
      error_detail: errorMsg,
      created_by: userId,
    });

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (adminEmail) {
      try {
        const { sendErrorReportEmail } = await import("@/lib/services/email/email.service");
        await sendErrorReportEmail(
          adminEmail,
          gymConfig.gym_name || "GymApp",
          {
            paso: `Notificación: ${config.notification_type}`,
            mensaje: errorMsg,
            timestamp: new Date().toLocaleString("es-ES"),
            contexto: { tipo: config.notification_type, config_id: config.id },
          },
          gymConfig.logo_url,
          gymConfig.address
        );
      } catch { /* silent */ }
    }

    return { miembrosNotificados: 0, sinProblemas: false };
  }
}

async function procesarMiembrosDeudores(gymConfig: {
  gym_name: string | null;
  logo_url: string | null;
  address: string | null;
  owner_email: string | null;
}): Promise<number> {
  const morosos = await pagosService.getMiembrosMorosos(undefined, supabase);
  if (morosos.length === 0) return 0;

  const ownerEmail = gymConfig.owner_email?.toLowerCase();
  const { sendPaymentDebtEmail } = await import(
    "@/lib/services/email/email.service"
  );

  let count = 0;
  for (const miembro of morosos) {
    if (ownerEmail && miembro.email?.toLowerCase() === ownerEmail) continue;

    try {
      const deudasParaEmail = miembro.deudas.length > 0
        ? miembro.deudas
        : [{ month_number: new Date().getMonth() + 1, year_number: new Date().getFullYear(), payment_amount: miembro.totalDeuda || 0 }];

      await sendPaymentDebtEmail(
        miembro.email,
        miembro.full_name,
        (gymConfig.gym_name as string) || "GymApp",
        deudasParaEmail,
        miembro.totalDeuda,
        gymConfig.logo_url as string | null,
        gymConfig.address as string | null
      );
      count++;
    } catch {
      // silent
    }
  }

  return count;
}

async function procesarRecordatorioPago(
  diasPrevio: number,
  gymConfig: Record<string, unknown>,
  forzar: boolean = false
): Promise<number> {
  const nombreGym = (gymConfig.gym_name as string) || "GymApp";
  const logoUrl = gymConfig.logo_url as string | null;
  const duenoEmail = gymConfig.owner_email as string | null;
  const direccion = gymConfig.address as string | null;
  const modoCobro = (gymConfig.billing_mode as "dia_uno" | "fecha_inscripcion") || "dia_uno";

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const hoy = new Date();

  if (!forzar) {
    const { data: configRecordatorio } = await supabase
      .from("notification_config")
      .select("id")
      .eq("notification_type", "recordatorio_pago")
      .maybeSingle();

    if (configRecordatorio) {
      const inicioMes = new Date(anioActual, mesActual - 1, 1).toISOString();
      const finMes = new Date(anioActual, mesActual, 0, 23, 59, 59).toISOString();
      const { data: logExistente } = await supabase
        .from("notification_log")
        .select("id")
        .eq("notification_config_id", configRecordatorio.id)
        .gte("sent_at", inicioMes)
        .lte("sent_at", finMes)
        .limit(1)
        .maybeSingle();

      if (logExistente) return 0;
    }
  }

  const { data: miembros } = await supabase
    .from("profiles")
    .select("id, email, full_name, start_date")
    .in("role", ["miembro", "super_admin"])
    .eq("activo", true)
    .not("email", "is", null);

  if (!miembros || miembros.length === 0) return 0;

  let candidatos = miembros.filter((m) => m.email !== duenoEmail);

  if (candidatos.length === 0) return 0;

  const idsCandidatos = candidatos.map((m) => m.id);
  const { data: libreRows } = await supabase
    .from("memberships")
    .select("user_id")
    .in("user_id", idsCandidatos)
    .eq("status", "activa")
    .is("end_date", null);

  const idsLibres = new Set((libreRows || []).map((r) => r.user_id));
  candidatos = candidatos.filter((m) => !idsLibres.has(m.id));

  if (candidatos.length === 0) return 0;

  const { data: pagosHeader } = await supabase
    .from("payments")
    .select("id, user_id")
    .in("status", ["aprobado", "suspendido"]);

  const pagoIds = (pagosHeader || []).map((p) => p.id);
  const { data: pagosDetalles } = await supabase
    .from("payment_detail")
    .select("payment_id, payment_amount")
    .in("payment_id", pagoIds.length > 0 ? pagoIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("month_number", mesActual)
    .eq("year_number", anioActual);

  const pagoUsuarioMap = new Map((pagosHeader || []).map((p) => [p.id, p.user_id]));
  const usuariosConPago = new Set(
    (pagosDetalles || []).map((d) => pagoUsuarioMap.get(d.payment_id)).filter(Boolean)
  );

  const deudores = candidatos.filter((m) => {
    if (usuariosConPago.has(m.id)) return false;
    if (!m.start_date) return false;

    if (forzar) return true;

    const diaCobro = getDiaCobro(m.start_date, mesActual, anioActual, modoCobro);
    const notif = getDiaNotificacion(diaCobro, diasPrevio, mesActual, anioActual);

    return hoy.getDate() === notif.dia &&
      hoy.getMonth() + 1 === notif.mes &&
      hoy.getFullYear() === notif.anio;
  });

  if (deudores.length === 0) return 0;

  let count = 0;
  for (const deudor of deudores) {
    try {
      const diaCobro = getDiaCobro(deudor.start_date!, mesActual, anioActual, modoCobro);
      const diasRestantesMes = diaCobro - hoy.getDate();

      const { sendPaymentReminderEmail } = await import(
        "@/lib/services/email/email.service"
      );
      await sendPaymentReminderEmail(
        deudor.email!,
        deudor.full_name,
        nombreGym,
        forzar ? 0 : Math.max(0, diasRestantesMes),
        new Date(anioActual, mesActual, diaCobro).toLocaleDateString("es-ES"),
        logoUrl,
        direccion
      );
      count++;
      await sleep(3000);
    } catch {
      // silent
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
          const diaCobro = getDiaCobro(d.start_date!, mesActual, anioActual, modoCobro);
          return {
            nombre: d.full_name,
            diasRestantes: forzar ? 0 : Math.max(0, diaCobro - hoy.getDate()),
            fechaVencimiento: new Date(anioActual, mesActual, diaCobro).toLocaleDateString("es-ES"),
          };
        }),
        logoUrl,
        direccion
      );
      count++;
    } catch {
      // silent
    }
  }

  return count;
}

async function procesarResumenDueno(gymConfig: Record<string, unknown>): Promise<number> {
  if (!gymConfig.owner_email) throw new Error(messages.notificaciones.noDuenoEmail);

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const { data: pagosAprobadosHeader } = await supabase
    .from("payments")
    .select("id")
    .eq("status", "aprobado");

  const aprobadosIds = (pagosAprobadosHeader || []).map((p) => p.id);
  const { data: pagosAprobadosDetalles } = await supabase
    .from("payment_detail")
    .select("payment_amount")
    .in("payment_id", aprobadosIds.length > 0 ? aprobadosIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("month_number", mesActual)
    .eq("year_number", anioActual);

  const { data: pagosPendientesHeader } = await supabase
    .from("payments")
    .select("id")
    .in("status", ["pendiente", "suspendido"]);

  const pendientesIds = (pagosPendientesHeader || []).map((p) => p.id);
  const { data: pagosPendientesDetalles } = await supabase
    .from("payment_detail")
    .select("payment_amount")
    .in("payment_id", pendientesIds.length > 0 ? pendientesIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("month_number", mesActual)
    .eq("year_number", anioActual);

  const { count: miembrosActivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "miembro")
    .eq("activo", true);

  const morosos = await pagosService.getMiembrosMorosos(anioActual, supabase);
  const miembrosDeudores = morosos.filter((m) => m.mesesDeuda.length > 0).length;

  const { count: migraciones } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "migrado");

  try {
    const { sendAdminSummaryEmail } = await import(
      "@/lib/services/email/email.service"
    );
    await sendAdminSummaryEmail(
      gymConfig.owner_email as string,
      (gymConfig.gym_name as string) || "GymApp",
      {
        pagosAprobados: (pagosAprobadosDetalles || []).length,
        pagosPendientes: (pagosPendientesDetalles || []).length,
        montoCobrado: (pagosAprobadosDetalles || []).reduce(
          (sum, p) => sum + p.payment_amount,
          0
        ),
        montoPendiente: (pagosPendientesDetalles || []).reduce(
          (sum, p) => sum + p.payment_amount,
          0
        ),
        miembrosAlDia: miembrosActivos || 0,
        miembrosDeudores,
        migraciones: migraciones || 0,
      },
      `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/pagos`,
      gymConfig.logo_url as string | null
    );
    return 1;
  } catch {
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

  const { data: pagosAprobadosMesHeader } = await supabase
    .from("payments")
    .select("id")
    .eq("status", "aprobado");

  const aprobadosMesIds = (pagosAprobadosMesHeader || []).map((p) => p.id);
  const { data: pagosAprobadosMesDetalles } = await supabase
    .from("payment_detail")
    .select("payment_amount")
    .in("payment_id", aprobadosMesIds.length > 0 ? aprobadosMesIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("month_number", mesActual)
    .eq("year_number", anioActual);

  const { data: pagosPendientesMesHeader } = await supabase
    .from("payments")
    .select("id")
    .in("status", ["pendiente", "suspendido"]);

  const pendientesMesIds = (pagosPendientesMesHeader || []).map((p) => p.id);
  const { data: pagosPendientesMesDetalles } = await supabase
    .from("payment_detail")
    .select("payment_amount")
    .in("payment_id", pendientesMesIds.length > 0 ? pendientesMesIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("month_number", mesActual)
    .eq("year_number", anioActual);

  const { data: ultimoMiembro } = await supabase
    .from("profiles")
    .select("full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: ultimoPago } = await supabase
    .from("payments")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: erroresRecientes } = await supabase
    .from("notification_log")
    .select("id, sent_at, error_detail, notification_config(notification_type)")
    .eq("no_issues", false)
    .order("sent_at", { ascending: false })
    .limit(10);

  const erroresFormateados = (erroresRecientes || []).map((e) => ({
    tipo: (e as unknown as { notification_config?: { notification_type?: string } }).notification_config?.notification_type || "desconocido",
    fecha: new Date(e.sent_at).toLocaleDateString("es-ES"),
    detalle: e.error_detail || "Sin detalle",
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
      (gymConfig.gym_name as string) || "GymApp",
      {
        totalMiembrosActivos: totalActivos || 0,
        totalMiembrosInactivos: totalInactivos || 0,
        pagosAprobadosMes: (pagosAprobadosMesDetalles || []).length,
        pagosPendientesMes: (pagosPendientesMesDetalles || []).length,
        montoRecaudadoMes: (pagosAprobadosMesDetalles || []).reduce(
          (s, p) => s + p.payment_amount,
          0
        ),
        montoPendienteMes: (pagosPendientesMesDetalles || []).reduce(
          (s, p) => s + p.payment_amount,
          0
        ),
        capacidad: totalActivos || 0,
        maxMiembros: gymConfig.max_members as number,
        ultimoMiembroRegistrado: ultimoMiembro
          ? ultimoMiembro.full_name
          : "N/A",
        ultimoPagoRegistrado: ultimoPago
          ? new Date(ultimoPago.created_at).toLocaleDateString("es-ES")
          : "N/A",
        migraciones: migraciones || 0,
      },
      gymConfig.logo_url as string | null,
      undefined,
      erroresFormateados
    );
    return 1;
  } catch {
    return 0;
  }
}
