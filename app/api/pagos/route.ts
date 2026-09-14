import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";

export async function DELETE(request: Request) {
  try {
    const supabase = await createAuthClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "super_admin";

    const { searchParams } = new URL(request.url);
    const pagoId = searchParams.get("id");
    if (!pagoId) {
      return NextResponse.json({ error: "Missing pago ID" }, { status: 400 });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verificar que el pago existe y su estado
    const { data: pagoActual } = await serviceSupabase
      .from("payments")
      .select("status, user_id")
      .eq("id", pagoId)
      .single();

    if (!pagoActual) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    const esPendiente = ["pendiente", "suspendido_pendiente"].includes(pagoActual.status);
    const esAprobado = pagoActual.status === "aprobado";

    if (isAdmin) {
      // Super admin: puede borrar pendientes/suspendido_pendiente + el último aprobado
      if (esAprobado) {
        const { data: ultimo } = await serviceSupabase
          .from("payments")
          .select("id")
          .eq("user_id", pagoActual.user_id)
          .eq("status", "aprobado")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (ultimo?.id !== pagoId) {
          return NextResponse.json({ error: "Solo se puede eliminar el último pago aprobado" }, { status: 403 });
        }
      } else if (!esPendiente) {
        return NextResponse.json({ error: "No se puede eliminar este pago" }, { status: 403 });
      }
    } else {
      // Miembro: solo puede borrar sus propios pendientes
      if (pagoActual.user_id !== user.id || !esPendiente) {
        return NextResponse.json({ error: "No tienes permiso para eliminar este pago" }, { status: 403 });
      }
    }

    // ON DELETE CASCADE elimina payment_detail automáticamente
    const { error } = await serviceSupabase.from("payments").delete().eq("id", pagoId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
