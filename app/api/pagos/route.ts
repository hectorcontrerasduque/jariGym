import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import { calcularMontoInscripcionAprobado } from "@/lib/features/pagos/inscription-amount";

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

    const esPendiente = pagoActual.status === "pendiente";

    // Último registro del miembro: el más reciente por fecha de creación
    // (desempate por id). Solo ese pago puede eliminarse.
    const { data: ultimoPago } = await serviceSupabase
      .from("payments")
      .select("id")
      .eq("user_id", pagoActual.user_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    const esUltimoRegistro = ultimoPago?.id === pagoId;

    if (isAdmin) {
      // Super admin: solo el último registro, sin importar su estatus
      if (!esUltimoRegistro) {
        return NextResponse.json({ error: messages.pagos.soloUltimoRegistro }, { status: 403 });
      }
    } else {
      // Miembro: solo su último registro y solo si está pendiente
      if (pagoActual.user_id !== user.id || !esPendiente || !esUltimoRegistro) {
        return NextResponse.json({ error: messages.pagos.soloUltimoRegistroPropio }, { status: 403 });
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
          .update({ inscription_paid: false, inscription_date: null, inscription_amount_paid: 0 })
          .eq("id", pagoActual.user_id);
      } else {
        const inscriptionAmount = await calcularMontoInscripcionAprobado(serviceSupabase, pagoActual.user_id);
        await serviceSupabase
          .from("profiles")
          .update({ inscription_amount_paid: inscriptionAmount })
          .eq("id", pagoActual.user_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
