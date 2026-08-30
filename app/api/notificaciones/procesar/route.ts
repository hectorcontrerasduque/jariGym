import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { getDiaCobro, getDiaNotificacion } from "@/lib/utils";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    let query = supabase
      .from("notificacion_config")
      .select("*")
      .eq("habilitado", true);
    if (tipoFiltro) {
      query = query.eq("tipo_notificacion", tipoFiltro);
    }

    const configs = await query;

    if (configs.error || !configs.data) {
      return NextResponse.json({ ejecutadas: 0, enviados: 0, errores: 0 });
    }

    let ejecuciones = 0;
    let enviados = 0;
    let errores = 0;

    for (const config of configs.data) {
      const { frecuencia_diaria, frecuencia_semanal, frecuencia_quincenal, frecuencia_mensual, dias_previo } = config;

      let candidatos;
      const hoy = new Date();
      if (forzar) {
        candidatos = await supabase
          .from("miembros")
          .select("id, full_name, email, start_date, activo, role")
          .maybeSingle();
      } else {
        if (frecuencia_diaria) {
          candidatos = await supabase
            .from("miembros")
            .select("id, full_name, email, start_date, activo, role")
            .eq("activo", true);
        } else if (frecuencia_semanal) {
          candidatos = await supabase
            .from("miembros")
            .select("id, full_name, email, start_date, activo, role")
            .eq("activo", true)
            .not("role", "in", ["super_admin", "miembro"]);
        } else if (frecuencia_quincenal) {
          candidatos = await supabase
            .from("miembros")
            .select("id, full_name, email, start_date, activo, role")
            .eq("activo", true);
        } else if (frecuencia_mensual) {
          candidatos = await supabase
            .from("miembros")
            .select("id, full_name, email, start_date, activo, role")
            .eq("activo", true);
        }
      }

      if (!candidatos || !candidatos.data) {
        continue;
      }

      const miembrosList = Array.isArray(candidatos.data) ? candidatos.data : [candidatos.data];

      for (const miembro of miembrosList) {
        ejecuciones++;

        if (forzar) {
          // Modo forzar: envía a todos los miembros activos
          const diaCobro = getDiaCobro(miembro.start_date, hoy.getMonth() + 1, hoy.getFullYear(), gymConfig.billing_mode || "dia_uno");
          const notif = getDiaNotificacion(diaCobro, dias_previo, hoy.getMonth() + 1, hoy.getFullYear());

          if (hoy.getDate() === notif.dia && hoy.getMonth() + 1 === notif.mes && hoy.getFullYear() === notif.anio) {
            try {
              enviados++;
            } catch {
              errores++;
            }
          }
        } else {
          // Modo normal: verifica si es el día de notificación para este miembro específico
          const diaCobro = getDiaCobro(miembro.start_date, hoy.getMonth() + 1, hoy.getFullYear(), gymConfig.billing_mode || "dia_uno");
          const notif = getDiaNotificacion(diaCobro, dias_previo, hoy.getMonth() + 1, hoy.getFullYear());

          if (hoy.getDate() === notif.dia && hoy.getMonth() + 1 === notif.mes && hoy.getFullYear() === notif.anio) {
            try {
              enviados++;
            } catch {
              errores++;
            }
          }
        }
      }
    }

    return NextResponse.json({ ejecuciones, enviados, errores });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}