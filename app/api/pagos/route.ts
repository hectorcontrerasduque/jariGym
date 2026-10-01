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

    const esPendiente = ["pendiente"].includes(pagoActual.status);
    const esAprobado = pagoActual.status === "aprobado";

    if (isAdmin) {
      // Super admin: puede borrar pendientes + el último aprobado
      if (esAprobado) {
        // Buscar el último aprobado usando year_number/month_number del detail (igual que la UI)
        const { data: todosAprobados } = await serviceSupabase
          .from("payments")
          .select("id, payment_detail(year_number, month_number)")
          .eq("user_id", pagoActual.user_id)
          .eq("status", "aprobado");

        if (!todosAprobados || todosAprobados.length === 0) {
          return NextResponse.json({ error: "No hay pagos aprobados" }, { status: 404 });
        }

        // Ordenar por year_number * 100 + month_number desc (igual que la UI)
        const ordenados = todosAprobados
          .map(p => {
            const maxKey = (p.payment_detail || []).reduce((max, d) => {
              const key = ((d.year_number || 0) * 100 + (d.month_number || 0));
              return key > max ? key : max;
            }, 0);
            return { id: p.id, maxKey };
          })
          .sort((a, b) => b.maxKey - a.maxKey || (b.id || "").localeCompare(a.id || ""));

        if (ordenados[0].id !== pagoId) {
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

    // Check if payment has inscription detail before deleting
    const { data: detalles } = await serviceSupabase
      .from("payment_detail")
      .select("payment_type")
      .eq("payment_id", pagoId);

    const tieneInscripcion = detalles?.some(d => d.payment_type === "inscripcion");

    // ON DELETE CASCADE elimina payment_detail automáticamente
    const { error } = await serviceSupabase.from("payments").delete().eq("id", pagoId);
    if (error) throw error;

    // If payment had inscription, check if another approved one remains
    if (tieneInscripcion) {
      const { data: otroInscripcion } = await serviceSupabase
        .from("payments")
        .select("id")
        .eq("user_id", pagoActual.user_id)
        .eq("status", "aprobado")
        .neq("id", pagoId)
        .limit(1);

      let hayOtraInscripcion = false;
      if (otroInscripcion && otroInscripcion.length > 0) {
        const { data: detalleOtro } = await serviceSupabase
          .from("payment_detail")
          .select("id")
          .eq("payment_id", otroInscripcion[0].id)
          .eq("payment_type", "inscripcion")
          .limit(1);
        hayOtraInscripcion = !!detalleOtro && detalleOtro.length > 0;
      }

      if (!hayOtraInscripcion) {
        await serviceSupabase
          .from("profiles")
          .update({ inscription_paid: false, inscription_date: null })
          .eq("id", pagoActual.user_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
