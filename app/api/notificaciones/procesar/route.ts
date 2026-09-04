import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { getDiaCobro, getDiaNotificacion } from "@/lib/utils";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ejecutarMiembrosDeudores(gymConfig: Record<string, unknown>): Promise<number> {
  const morosos = await pagosService.getMiembrosMorosos(undefined, supabase);
  if (morosos.length === 0) return 0;

  const ownerEmail = gymConfig.owner_email as string | null;
  const { sendPaymentDebtEmail } = await import("@/lib/services/email/email.service");

  let count = 0;
  for (const miembro of morosos) {
    if (ownerEmail && miembro.email?.toLowerCase() === ownerEmail.toLowerCase()) continue;

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
      await sleep(3000);
    } catch {
      // silent
    }
  }

  return count;
}

async function ejecutarRecordatorioPago(
  diasPrevio: number,
  gymConfig: Record<string, unknown>,
  forzar: boolean
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

  const { sendPaymentReminderEmail, sendAdminReminderEmail } = await import("@/lib/services/email/email.service");

  let count = 0;
  for (const deudor of deudores) {
    try {
      const diaCobro = getDiaCobro(deudor.start_date!, mesActual, anioActual, modoCobro);
      const diasRestantesMes = diaCobro - hoy.getDate();

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

async function ejecutarResumenDueno(gymConfig: Record<string, unknown>): Promise<number> {
  const duenoEmail = gymConfig.owner_email as string | null;
  if (!duenoEmail) return 0;

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

  const { sendAdminSummaryEmail } = await import("@/lib/services/email/email.service");
  await sendAdminSummaryEmail(
    duenoEmail,
    (gymConfig.gym_name as string) || "GymApp",
    {
      pagosAprobados: (pagosAprobadosDetalles || []).length,
      pagosPendientes: (pagosPendientesDetalles || []).length,
      montoCobrado: (pagosAprobadosDetalles || []).reduce((s, d) => s + (d.payment_amount || 0), 0),
      montoPendiente: (pagosPendientesDetalles || []).reduce((s, d) => s + (d.payment_amount || 0), 0),
      miembrosAlDia: (miembrosActivos || 0) - miembrosDeudores,
      miembrosDeudores,
      migraciones: migraciones || 0,
    },
    process.env.NEXT_PUBLIC_SITE_URL || "",
    gymConfig.logo_url as string | null,
    gymConfig.address as string | null
  );

  return 1;
}

async function ejecutarEstatusSistema(gymConfig: Record<string, unknown>): Promise<number> {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail) return 0;

  const { count: miembrosActivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "miembro")
    .eq("activo", true);

  const { count: miembrosInactivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "miembro")
    .eq("activo", false);

  const { count: pagosAprobadosMes } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "aprobado");

  const { count: pagosPendientesMes } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .in("status", ["pendiente", "suspendido"]);

  const { data: ultimoPago } = await supabase
    .from("payments")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: ultimoMiembro } = await supabase
    .from("profiles")
    .select("created_at")
    .eq("role", "miembro")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: errores } = await supabase
    .from("notification_log")
    .select("error_detail, sent_at")
    .eq("no_issues", false)
    .order("sent_at", { ascending: false })
    .limit(10);

  const { count: migraciones } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "migrado");

  const { sendSystemStatusEmail } = await import("@/lib/services/email/email.service");
  await sendSystemStatusEmail(
    adminEmail,
    (gymConfig.gym_name as string) || "GymApp",
    {
      totalMiembrosActivos: miembrosActivos || 0,
      totalMiembrosInactivos: miembrosInactivos || 0,
      pagosAprobadosMes: pagosAprobadosMes || 0,
      pagosPendientesMes: pagosPendientesMes || 0,
      montoRecaudadoMes: 0,
      montoPendienteMes: 0,
      capacidad: 0,
      maxMiembros: (gymConfig.max_members as number) || 50,
      ultimoMiembroRegistrado: ultimoMiembro?.created_at || "Nunca",
      ultimoPagoRegistrado: ultimoPago?.created_at || "Nunca",
      migraciones: migraciones || 0,
    },
    gymConfig.logo_url as string | null,
    gymConfig.address as string | null,
    (errores || []).map((e) => ({
      tipo: "notificacion",
      fecha: e.sent_at,
      detalle: e.error_detail || "Error desconocido",
    }))
  );

  return 1;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const rateLimitResponse = await applyRateLimit(request, {
      max: 5,
      windowMs: 20 * 60 * 1000,
      prefix: "auth",
    }, user.id);
    if (rateLimitResponse) return rateLimitResponse;

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
    const forzar = body?.forzar === true;

    const configsQuery = supabase
      .from("notification_config")
      .select("*")
      .eq("is_active", true);

    const { data: configs } = tipoFiltro
      ? await configsQuery.eq("notification_type", tipoFiltro)
      : await configsQuery;

    if (!configs || configs.length === 0) {
      return NextResponse.json({ ejecutadas: 0, enviados: 0, errores: 0 });
    }

    let ejecutadas = 0;
    let enviados = 0;
    let errores = 0;

    for (const config of configs) {
      try {
        let count = 0;

        switch (config.notification_type) {
          case "miembros_deudores":
            count = await ejecutarMiembrosDeudores(gymConfig);
            break;
          case "recordatorio_pago":
            count = await ejecutarRecordatorioPago(config.days_before || 7, gymConfig, forzar);
            break;
          case "resumen_dueno":
            count = await ejecutarResumenDueno(gymConfig);
            break;
          case "estatus_sistema":
            count = await ejecutarEstatusSistema(gymConfig);
            break;
        }

        enviados += count;
        ejecutadas++;

        await supabase.from("notification_log").insert({
          notification_config_id: config.id,
          members_notified: count,
          no_issues: true,
        });
      } catch (error) {
        errores++;
        const errorMsg = error instanceof Error ? error.message : "Error en ejecución manual";
        await supabase.from("notification_log").insert({
          notification_config_id: config.id,
          members_notified: 0,
          no_issues: false,
          error_detail: errorMsg,
        });

        const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
        if (adminEmail) {
          try {
            const { sendErrorReportEmail } = await import("@/lib/services/email/email.service");
            await sendErrorReportEmail(
              adminEmail,
              (gymConfig.gym_name as string) || "GymApp",
              {
                paso: `Notificación manual: ${config.notification_type}`,
                mensaje: errorMsg,
                timestamp: new Date().toLocaleString("es-ES"),
                contexto: { tipo: config.notification_type, config_id: config.id },
              },
              gymConfig.logo_url as string | null,
              gymConfig.address as string | null
            );
          } catch { /* silent */ }
        }
      }
    }

    return NextResponse.json({ ejecutadas, enviados, errores });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
