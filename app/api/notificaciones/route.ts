import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import {
  ejecutarCorrida,
  iniciarPresupuesto,
} from "@/lib/features/notificaciones/ejecucion";
import {
  asuntoReporte,
  construirReporteCorrida,
  enviarReporteTexto,
  reporteATexto,
} from "@/lib/features/notificaciones/reporte";
import { horarioNotificaciones } from "@/lib/features/notificaciones/horario";
import type { NextRequest } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return ejecutar(request);
}

export async function POST(request: NextRequest) {
  return ejecutar(request);
}

/** Reporte de fallo fatal (solo cron): el admin se entera aunque la ruta reviente. */
async function enviarReporteFatal(error: unknown, gymName: string): Promise<void> {
  try {
    const reporte = construirReporteCorrida({
      fecha: new Date(),
      origen: "cron",
      expresionCron: horarioNotificaciones()?.expresion ?? null,
      duracionMs: 0,
      miembrosActivos: 0,
      plantillas: [],
      errorFatal: error instanceof Error ? error.message : String(error),
    });
    await enviarReporteTexto(asuntoReporte(reporte, gymName), reporteATexto(reporte));
  } catch {
    // El error original se devuelve en la respuesta 500 (logs de Vercel).
  }
}

async function ejecutar(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const authHeader = request.headers.get("authorization");

  const isCronAuth = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
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

  let gymName = "GymApp";

  try {
    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("notifications_enabled, gym_name, logo_url, owner_email, max_members, address, billing_mode")
      .limit(1)
      .single();

    if (!gymConfig || !gymConfig.notifications_enabled) {
      return NextResponse.json({
        success: true,
        message: messages.notificaciones.notificacionesDeshabilitadas,
        ejecutadas: 0,
      });
    }

    gymName = gymConfig.gym_name || "GymApp";

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

    iniciarPresupuesto();

    const resumen = await ejecutarCorrida(supabase, {
      configs,
      gymConfig,
      userId,
      // El reporte de corrida es exclusivo del cron (CRON_SECRET); una llamada
      // con JWT de super_admin es manual y no genera reporte.
      origen: isCronAuth ? "cron" : "manual",
      respetarFrecuencia: true,
      expresionCron: horarioNotificaciones()?.expresion ?? null,
    });

    return NextResponse.json({
      success: true,
      ejecutadas: resumen.ejecutadas,
      enviados: resumen.enviados,
      errores: resumen.errores,
      reporte_enviado: resumen.reporteEnviado,
      reporte: resumen.reporteTexto,
    });
  } catch (error) {
    if (isCronAuth) {
      await enviarReporteFatal(error, gymName);
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
