import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import {
  ejecutarCorrida,
  iniciarPresupuesto,
} from "@/lib/features/notificaciones/ejecucion";

/**
 * Disparo manual de notificaciones (botones del panel). No consulta frecuencia:
 * la decisión de ejecutar la toma el admin, y `forzar` además salta la ventana
 * de días del recordatorio.
 */
export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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

    if (!gymConfig || !gymConfig.notifications_enabled) {
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

    iniciarPresupuesto();

    const resumen = await ejecutarCorrida(supabase, {
      configs,
      gymConfig,
      forzar,
      userId: user.id,
      origen: "manual",
      respetarFrecuencia: false,
    });

    return NextResponse.json({
      ejecutadas: resumen.ejecutadas,
      enviados: resumen.enviados,
      errores: resumen.errores,
    });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
