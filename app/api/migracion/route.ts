import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { sendWelcomeEmail } from "@/lib/services/email/email.service";

import { sanitizeOrFilter } from "@/lib/utils/sanitize";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { createOrUpdateUser } from "@/lib/services/miembros/profile.service";

export async function POST(request: Request) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 5,
    windowMs: 20 * 60 * 1000,
    prefix: "auth",
  });
  if (rateLimitResponse) return rateLimitResponse;
  
  try {
    const { nombreCompleto, phone_number, correo, password, selectedNombre } = await request.json();

    if (!nombreCompleto || !correo) {
      return NextResponse.json({ error: messages.migracion.camposRequeridos }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return NextResponse.json({ error: messages.migracion.emailInvalidError }, { status: 400 });
    }

    if (password && (typeof password !== "string" || password.length < 6)) {
      return NextResponse.json({ error: messages.migracion.passwordMinError }, { status: 400 });
    }

    const nombre = nombreCompleto.trim().toUpperCase();
    const email = correo.toLowerCase().trim();
    const profileNombre = selectedNombre ? selectedNombre.trim().toUpperCase() : nombre;
    const whatsappFormatted = phone_number && !phone_number.startsWith("+") ? `+58${phone_number}` : phone_number;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: configCheck } = await supabase
      .from("gym_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (!configCheck) {
      return NextResponse.json(
        { error: messages.migracion.configFaltante },
        { status: 400 }
      );
    }

    const { data: metodoEfectivo } = await supabase
      .from("gym_config_payment_methods")
      .select("amount_monthly, amount_inscription")
      .eq("payment_method", "efectivo")
      .eq("is_active", true)
      .maybeSingle();

    const montoMensual = metodoEfectivo?.amount_monthly || 0;
    const montoInscripcion = metodoEfectivo?.amount_inscription || 0;

    const searchName = selectedNombre || nombre;
    const words = searchName.split(/\s+/).filter((w: string) => w.length >= 1);
    let migracionRecords;

    if (words.length > 0) {
      // SECURITY: Sanitize input for PostgREST .or() to prevent injection
      const orFilter = sanitizeOrFilter(words);
      
      const { data, error: migracionError } = await supabase
        .from("migracion")
        .select("*")
        .or(orFilter)
        .eq("migrado", "no")
        .order("mes_pagar", { ascending: true });

      if (migracionError || !data || data.length === 0) {
        // Check if records exist but are already migrated
        const { data: migratedData } = await supabase
          .from("migracion")
          .select("nombre")
          .or(orFilter)
          .eq("migrado", "si")
          .limit(1);

        if (migratedData && migratedData.length > 0) {
          return NextResponse.json({ error: messages.migracion.yaMigrado }, { status: 400 });
        }
        return NextResponse.json({ error: messages.migracion.noResults }, { status: 404 });
      }

      // Only keep records that exactly match the selected name (no cross-name contamination)
      const exactMatchName = searchName.trim().toUpperCase();
      migracionRecords = data.filter((r) => r.nombre.toUpperCase() === exactMatchName);

      if (migracionRecords.length === 0) {
        // Check if exact name exists but already migrated
        const { data: migratedExact } = await supabase
          .from("migracion")
          .select("nombre")
          .or(orFilter)
          .eq("migrado", "si")
          .limit(1);

        if (migratedExact && migratedExact.length > 0) {
          return NextResponse.json({ error: messages.migracion.yaMigrado }, { status: 400 });
        }
        return NextResponse.json({ error: messages.migracion.noResults }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: messages.migracion.noResults }, { status: 404 });
    }

    // Only process records with estado "pagado" or "suspendido" (skip "debe")
    const migrablesRecords = migracionRecords.filter(
      (r) => r.estado === "pagado" || r.estado === "suspendido"
    );

    let userId: string;
    let isNewUser = false;

    // Calculate fecha_inicio from first pagado record
    const sortedForInsc = [...migrablesRecords].sort((a, b) => {
      if (a.anio_pagar !== b.anio_pagar) return a.anio_pagar - b.anio_pagar;
      return a.mes_pagar - b.mes_pagar;
    });
    const firstPagadoInsc = sortedForInsc.find((r) => r.estado === "pagado");
    const fechaInicioCalc = firstPagadoInsc
      ? `${firstPagadoInsc.anio_pagar}-${String(firstPagadoInsc.mes_pagar).padStart(2, "0")}-01`
      : `${new Date().getFullYear()}-01-01`;

    try {
      const result = await createOrUpdateUser(supabase, {
        email,
        full_name: profileNombre,
        password: password || undefined,
        phone_number: whatsappFormatted,
        start_date: fechaInicioCalc,
        isSuperAdmin: true,
        sendWelcome: false,
      });
      userId = result.userId;
      isNewUser = result.isNewAuthUser;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "email_duplicate") {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        if (!existingProfile) {
          return NextResponse.json({ error: messages.migracion.errorServidor }, { status: 500 });
        }
        userId = existingProfile.id;
        isNewUser = false;
      } else {
        return NextResponse.json({ error: messages.migracion.errorServidor }, { status: 500 });
      }
    }

    // Sort records by year and month
    const sortedRecords = [...migrablesRecords].sort((a, b) => {
      if (a.anio_pagar !== b.anio_pagar) return a.anio_pagar - b.anio_pagar;
      return a.mes_pagar - b.mes_pagar;
    });

    // Determine which records to process:
    // - All "pagado" records → aprobado
    // - "suspendido" records that come AFTER the first "pagado" → suspendido
    // - "suspendido" records BEFORE the first "pagado" → skip
    let foundFirstPagado = false;
    const recordsToProcess = [];
    for (const record of sortedRecords) {
      if (record.estado === "pagado") {
        foundFirstPagado = true;
        recordsToProcess.push(record);
      } else if (record.estado === "suspendido" && foundFirstPagado) {
        recordsToProcess.push(record);
      }
    }

    // Build pago records for RPC transaction
    const pagoRecords = recordsToProcess.map((record) => ({
      mes: record.mes_pagar,
      anio: record.anio_pagar,
      estado: record.estado,
    }));

    const migracionIds = migrablesRecords.map((r) => Number(r.id));

    // Execute payment creation + inscription + migration marking in a single transaction
    const { data: rpcResult, error: rpcError } = await supabase.rpc("migrar_miembro_pago", {
      p_user_id: userId,
      p_pago_records: pagoRecords,
      p_monto_mensual: montoMensual,
      p_monto_inscripcion: montoInscripcion,
      p_migracion_ids: migracionIds,
      p_fecha_inicio: fechaInicioCalc,
      p_whatsapp: whatsappFormatted,
      p_correo: email,
    });

    if (rpcError) {
      return NextResponse.json({ error: messages.migracion.errorServidor }, { status: 500 });
    }

    const pagosCreados = rpcResult?.pagos_creados || 0;
    const pagosActualizados = rpcResult?.pagos_actualizados || 0;

    const hasMigratedPayments = pagosCreados > 0 || pagosActualizados > 0;
    let welcomeEmailSent = false;

    if (isNewUser || hasMigratedPayments) {
      let gymName = "GymApp";
      let gymLogo: string | null = null;
      try {
        const { data: config } = await supabase
          .from("gym_config")
          .select("gym_name, logo_url")
          .maybeSingle();
        if (config?.gym_name) gymName = config.gym_name;
        if (config?.logo_url) gymLogo = config.logo_url;
      } catch {
        // silent
      }

      if (isNewUser) {
        try {
          await sendWelcomeEmail(email, email, password, gymName, gymLogo);
          welcomeEmailSent = true;
        } catch {
          // silent
        }
      }
    }

    return NextResponse.json({
      success: true,
      email,
      existingUser: !isNewUser,
      pagosCreados,
      pagosActualizados,
      welcomeEmailSent,
    });
  } catch {
    return NextResponse.json({ error: messages.migracion.errorServidor }, { status: 500 });
  }
}
