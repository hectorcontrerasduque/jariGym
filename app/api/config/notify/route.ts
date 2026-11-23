import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { messages, mensaje } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { enviarPushAUsuarios } from "@/lib/features/push/service";
import { sendConfiguracionDuenoEmail } from "@/lib/services/email/email.service";
import type { CambioDueno } from "@/lib/services/email/templates/configuracion-dueno";

function cambiosValidos(valor: unknown): CambioDueno[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((c): c is CambioDueno => Boolean(c) && typeof c === "object")
    .map((c) => ({
      campo: String((c as CambioDueno).campo ?? ""),
      anterior: String((c as CambioDueno).anterior ?? ""),
      nuevo: String((c as CambioDueno).nuevo ?? ""),
    }))
    .filter((c) => c.campo.length > 0);
}

/**
 * Avisa al propietario (correo + web push) cuando sus datos se crean o cambian
 * desde Config. Se invoca fire-and-forget después de guardar; es fail-open y el
 * push solo sale si está habilitado en Notificaciones (`gym_config.push_enabled`).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const limitada = await applyRateLimit(
      request,
      { max: 10, windowMs: 5 * 60 * 1000, prefix: "config-notify" },
      user.id
    );
    if (limitada) return limitada;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const cambios = cambiosValidos(body?.cambios);
    const creado = body?.creado === true;
    if (cambios.length === 0 && !creado) {
      return NextResponse.json({ success: true, notificado: false });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: config } = await serviceSupabase
      .from("gym_config")
      .select("owner_email, owner_name, gym_name, logo_url")
      .limit(1)
      .maybeSingle();

    const ownerEmail = String(config?.owner_email ?? "").trim();
    if (!ownerEmail) {
      return NextResponse.json({ error: messages.configuracion.ownerRequired }, { status: 400 });
    }

    const gymName = String(config?.gym_name ?? "").trim() || "GymApp";
    const ownerName = String(config?.owner_name ?? "").trim();
    const logo = typeof config?.logo_url === "string" ? config.logo_url : null;

    // Correo al correo vigente (el nuevo, si cambió). Fail-open.
    try {
      await sendConfiguracionDuenoEmail(
        ownerEmail,
        ownerName,
        gymName,
        creado ? "bienvenida" : "actualizacion",
        cambios,
        logo
      );
    } catch {
      // El guardado ya ocurrió; un fallo de correo no debe afectar.
    }

    // Web push solo al propietario (el servicio respeta push_enabled/VAPID).
    const { data: ownerProfile } = await serviceSupabase
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (ownerProfile?.id) {
      const payload = creado
        ? {
            title: mensaje(messages.configuracion.notifDuenoBienvenidaTitulo, { gym: gymName }),
            body: mensaje(messages.configuracion.notifDuenoBienvenidaCuerpo, { gym: gymName }),
            url: "/dashboard/configuracion",
          }
        : {
            title: messages.configuracion.notifDuenoActualizacionTitulo,
            body: mensaje(messages.configuracion.notifDuenoActualizacionCuerpo, { gym: gymName }),
            url: "/dashboard/configuracion",
          };
      await enviarPushAUsuarios(serviceSupabase, [ownerProfile.id], payload);
    }

    return NextResponse.json({ success: true, notificado: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
