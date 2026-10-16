import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { pushConfigurado, pushHabilitado } from "@/lib/features/push/service";

const LIMITE_ENDPOINT = 2048;
const LIMITE_CLAVE = 512;

/**
 * Registra (o renueva) la suscripción push del dispositivo autenticado.
 * 409 = el canal está apagado (sin VAPID o `gym_config.push_enabled = false`).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const limitada = await applyRateLimit(
      request,
      { max: 10, windowMs: 5 * 60 * 1000, prefix: "push" },
      user.id
    );
    if (limitada) return limitada;

    if (!pushConfigurado()) {
      return NextResponse.json(
        { error: messages.push.sinConfigurar, codigo: "sin_configurar" },
        { status: 409 }
      );
    }
    if (!(await pushHabilitado(supabase))) {
      return NextResponse.json(
        { error: messages.push.deshabilitado, codigo: "deshabilitado" },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
    const invalida =
      !endpoint.startsWith("https://") ||
      endpoint.length > LIMITE_ENDPOINT ||
      !p256dh ||
      p256dh.length > LIMITE_CLAVE ||
      !auth ||
      auth.length > LIMITE_CLAVE;
    if (invalida) {
      return NextResponse.json({ error: messages.push.badRequest }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent")?.slice(0, 255) ?? null;

    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: user.id, endpoint, p256dh, auth, user_agent: userAgent },
      { onConflict: "user_id,endpoint" }
    );
    if (error) {
      return NextResponse.json({ error: messages.push.errorGuardar }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: messages.push.errorServidor }, { status: 500 });
  }
}

/**
 * Da de baja la suscripción del dispositivo autenticado (idempotente:
 * borrar algo que no existe responde `success` igual).
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) {
      return NextResponse.json({ error: messages.push.badRequest }, { status: 400 });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
    if (error) {
      return NextResponse.json({ error: messages.push.errorServidor }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: messages.push.errorServidor }, { status: 500 });
  }
}
