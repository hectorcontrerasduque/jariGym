import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { sendPaymentApprovedEmail, sendPaymentRejectedEmail } from "@/lib/services/email/email.service";
import { messages } from "@/lib/messages";

export async function POST(request: Request) {
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
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const body = await request.json();
    const { pagoId, action, notas } = body as {
      pagoId: string;
      action: "aprobado" | "rechazado";
      notas?: string;
    };

    if (!pagoId || !action) {
      return NextResponse.json({ error: "Faltan pagoId o action" }, { status: 400 });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: pago, error: pagoError } = await serviceSupabase
      .from("payments")
      .select("user_id, payment_amount, payment_method")
      .eq("id", pagoId)
      .single();

    if (pagoError || !pago) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    const { data: memberProfile, error: profileError } = await serviceSupabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", pago.user_id)
      .single();

    if (profileError || !memberProfile?.email) {
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
    }

    const { data: detalles } = await serviceSupabase
      .from("payment_detail")
      .select("payment_type, month_number, year_number")
      .eq("payment_id", pagoId);

    const { data: gymConfig } = await serviceSupabase
      .from("gym_config")
      .select("gym_name, logo_url")
      .limit(1)
      .single();

    const gymName = gymConfig?.gym_name || "GymApp";
    const gymLogo = gymConfig?.logo_url || null;
    const metodoPago = pago.payment_method || "No especificado";
    const monto = pago.payment_amount || 0;
    const meses = (detalles || [])
      .filter((d) => d.payment_type === "mensualidad" && d.month_number && d.year_number)
      .map((d) => ({ month_number: d.month_number!, year_number: d.year_number! }));

    if (action === "aprobado") {
      await sendPaymentApprovedEmail(
        memberProfile.email,
        memberProfile.full_name || "Miembro",
        gymName,
        monto,
        meses,
        metodoPago,
        gymLogo
      );
    } else if (action === "rechazado") {
      await sendPaymentRejectedEmail(
        memberProfile.email,
        memberProfile.full_name || "Miembro",
        gymName,
        monto,
        meses,
        metodoPago,
        notas || "Pago rechazado",
        gymLogo
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
