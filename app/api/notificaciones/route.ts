import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { verificarFrecuencia } from "@/lib/features/notificaciones/frecuencia";
import {
  ejecutarYRegistrar,
  iniciarPresupuesto,
  ultimoIntento,
} from "@/lib/features/notificaciones/ejecucion";
import type { NextRequest } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return ejecutar(request);
}

export async function POST(request: NextRequest) {
  return ejecutar(request);
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

    let ejecutadas = 0;
    let enviados = 0;
    let errores = 0;

    for (const config of configs) {
      const fechaUltimoIntento = await ultimoIntento(supabase, config.id);
      if (!verificarFrecuencia(config, fechaUltimoIntento)) continue;

      ejecutadas++;
      const resultado = await ejecutarYRegistrar(supabase, config, gymConfig, {
        userId,
        origen: "cron",
      });

      enviados += resultado.enviados;
      if (!resultado.sinProblemas) errores++;
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
