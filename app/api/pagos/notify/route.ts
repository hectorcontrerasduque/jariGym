import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { sendPaymentApprovedEmail, sendPaymentRejectedEmail } from "@/lib/services/email/email.service";
import { messages, mensaje } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { derivarEventoPago } from "@/lib/features/pagos/domain/notify";
import { enviarPushAAdmins, enviarPushAUsuarios } from "@/lib/features/push/service";
import { formatCurrency } from "@/lib/utils";

/**
 * Notifica un cambio o alta de pago. El evento se DERIVA del estado real en BD
 * y del rol del llamador (`derivarEventoPago`), no de lo que pida el cliente:
 *
 * - aprobado/rechazado → correo + push al MIEMBRO (requiere super_admin)
 * - pendiente + miembro dueño → push a los ADMINS ("reportado")
 * - pendiente + super_admin de un tercero → push al MIEMBRO ("registrado")
 *
 * El push es fail-open (nunca lanza, nunca decide el resultado); el correo de
 * aprobado/rechazado conserva su comportamiento histórico (error → 500).
 * El monto sale de `payment_detail` (fix ROADMAP#5: `payments.payment_amount` no existe).
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
      { max: 60, windowMs: 5 * 60 * 1000, prefix: "notify" },
      user.id
    );
    if (limitada) return limitada;

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const callerRole = callerProfile?.role ?? null;

    const body = await request.json().catch(() => null);
    const pagoId = typeof body?.pagoId === "string" ? body.pagoId.trim() : "";
    if (!pagoId) {
      return NextResponse.json({ error: messages.eventosPago.faltanPagoId }, { status: 400 });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: pago, error: pagoError } = await serviceSupabase
      .from("payments")
      .select("user_id, status, payment_method, payment_note")
      .eq("id", pagoId)
      .single();

    if (pagoError || !pago) {
      return NextResponse.json({ error: messages.eventosPago.pagoNoEncontrado }, { status: 404 });
    }

    const evento = derivarEventoPago({
      status: pago.status,
      callerRole,
      esDueno: pago.user_id === user.id,
    });
    if (evento === "denegado") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }
    if (evento === "estado_invalido") {
      return NextResponse.json({ error: messages.eventosPago.estadoInvalido }, { status: 400 });
    }
    if (evento === "sin_evento") {
      return NextResponse.json({ success: true, evento: null });
    }

    const { data: detalles } = await serviceSupabase
      .from("payment_detail")
      .select("payment_type, payment_amount, month_number, year_number")
      .eq("payment_id", pagoId);
    const monto = (detalles ?? []).reduce((suma, d) => suma + (d.payment_amount || 0), 0);
    const meses = (detalles ?? [])
      .filter((d) => d.payment_type === "mensualidad" && d.month_number && d.year_number)
      .map((d) => ({ month_number: d.month_number!, year_number: d.year_number! }));

    const { data: memberProfile, error: profileError } = await serviceSupabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", pago.user_id)
      .single();

    if (profileError || !memberProfile) {
      return NextResponse.json({ error: messages.eventosPago.miembroNoEncontrado }, { status: 404 });
    }

    const nombreMiembro =
      memberProfile.full_name || memberProfile.email || messages.eventosPago.miembroAnonimo;
    const montoStr = formatCurrency(monto);

    if (evento === "aprobado" || evento === "rechazado") {
      if (!memberProfile.email) {
        return NextResponse.json({ error: messages.eventosPago.miembroNoEncontrado }, { status: 404 });
      }

      const { data: gymConfig } = await serviceSupabase
        .from("gym_config")
        .select("gym_name, logo_url")
        .limit(1)
        .single();
      const gymName = gymConfig?.gym_name || messages.eventosPago.gymNameDefault;
      const metodoPago = pago.payment_method || messages.eventosPago.metodoNoEspecificado;

      let errorEmail: unknown = null;
      try {
        if (evento === "aprobado") {
          await sendPaymentApprovedEmail(
            memberProfile.email,
            nombreMiembro,
            gymName,
            monto,
            meses,
            metodoPago,
            gymConfig?.logo_url || null
          );
        } else {
          const motivo = pago.payment_note || messages.eventosPago.sinMotivo;
          await sendPaymentRejectedEmail(
            memberProfile.email,
            nombreMiembro,
            gymName,
            monto,
            meses,
            metodoPago,
            motivo,
            gymConfig?.logo_url || null
          );
        }
      } catch (err) {
        errorEmail = err;
      }

      const payload =
        evento === "aprobado"
          ? {
              title: messages.eventosPago.aprobadoTitulo,
              body: mensaje(messages.eventosPago.aprobadoCuerpo, { monto: montoStr }),
              url: "/dashboard/mis-pagos",
            }
          : {
              title: messages.eventosPago.rechazadoTitulo,
              body: mensaje(messages.eventosPago.rechazadoCuerpo, {
                monto: montoStr,
                motivo: pago.payment_note || messages.eventosPago.sinMotivo,
              }),
              url: "/dashboard/mis-pagos",
            };
      await enviarPushAUsuarios(serviceSupabase, [pago.user_id], payload);

      if (errorEmail) throw errorEmail;
      return NextResponse.json({ success: true, evento });
    }

    if (evento === "reportado") {
      await enviarPushAAdmins(serviceSupabase, {
        title: messages.eventosPago.reportadoTitulo,
        body: mensaje(messages.eventosPago.reportadoCuerpo, {
          nombre: nombreMiembro,
          monto: montoStr,
        }),
        url: "/dashboard/pagos",
      });
      return NextResponse.json({ success: true, evento });
    }

    // evento === "registrado": super_admin creó un pago pendiente para un tercero
    await enviarPushAUsuarios(serviceSupabase, [pago.user_id], {
      title: messages.eventosPago.registradoTitulo,
      body: mensaje(messages.eventosPago.registradoCuerpo, { monto: montoStr }),
      url: "/dashboard/mis-pagos",
    });
    return NextResponse.json({ success: true, evento });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
