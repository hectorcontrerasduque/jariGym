import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { sendWelcomeEmail } from "@/lib/services/email/email.service";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  try {
    const { nombreCompleto, whatsapp, correo, password, selectedNombre } = await request.json();

    if (!nombreCompleto || !whatsapp || !correo || !password) {
      return NextResponse.json({ error: messages.migracion.error }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return NextResponse.json({ error: messages.migracion.emailInvalidError }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: messages.migracion.passwordMinError }, { status: 400 });
    }

    const nombre = nombreCompleto.trim().toUpperCase();
    const email = correo.toLowerCase().trim();

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
      .from("gym_config_metodos_pago")
      .select("monto_mensual, monto_inscripcion")
      .eq("metodo_pago", "efectivo")
      .eq("habilitado", true)
      .maybeSingle();

    const montoMensual = metodoEfectivo?.monto_mensual || 0;
    const montoInscripcion = metodoEfectivo?.monto_inscripcion || 0;

    const searchName = selectedNombre || nombre;
    const words = searchName.split(/\s+/).filter((w: string) => w.length >= 2);
    let migracionRecords;

    if (words.length > 0) {
      const conditions: string[] = [];
      for (const w of words) {
        conditions.push(`nombre.ilike.%${w}%`);
        if (w.length > 3) {
          conditions.push(`nombre.ilike.%${w.slice(0, -1)}%`);
        }
      }
      const orFilter = conditions.join(",");
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
      migracionRecords = data.filter((r: any) => r.nombre.toUpperCase() === exactMatchName);

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

    // Update whatsapp and correo in migracion records for matched name
    const matchedIds = migracionRecords.map((r: any) => r.id);
    await supabase
      .from("migracion")
      .update({ whatsapp, correo: email })
      .in("id", matchedIds);

    // Only process records with estado "pagado" or "suspendido" (skip "debe")
    const migrablesRecords = migracionRecords.filter(
      (r: any) => r.estado === "pagado" || r.estado === "suspendido"
    );

    let userId: string;
    let isNewUser = false;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      userId = existingProfile.id;
      // Update existing profile with latest data from migration form
      await supabase
        .from("profiles")
        .update({
          nombre_completo: nombre,
          whatsapp,
          email,
          registered: true,
          activo: true,
        })
        .eq("id", userId);
    } else {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { nombre_completo: nombre },
      });

      if (authError) {
        return NextResponse.json({ error: `${messages.migracion.crearUsuarioError}: ${authError.message}` }, { status: 500 });
      }

      if (!authUser?.user?.id) {
        return NextResponse.json({ error: messages.migracion.usuarioNoCreado }, { status: 500 });
      }
      userId = authUser.user.id;

      // The handle_new_user trigger may have auto-created the profile row.
      // Check if it exists before inserting to avoid duplicate key error.
      const { data: triggeredProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      const profileFields = {
        email,
        nombre_completo: nombre,
        whatsapp,
        role: "miembro" as const,
        activo: true,
        registered: true,
        fecha_inscripcion: "2026-01-01",
        inscripcion_pagada: false,
      };

      if (triggeredProfile) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update(profileFields)
          .eq("id", userId);
        if (profileError) {
          await supabase.auth.admin.deleteUser(userId);
          return NextResponse.json({ error: `${messages.migracion.crearPerfilError}: ${profileError.message}` }, { status: 500 });
        }
      } else {
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({ id: userId, ...profileFields });
        if (profileError) {
          await supabase.auth.admin.deleteUser(userId);
          return NextResponse.json({ error: `${messages.migracion.crearPerfilError}: ${profileError.message}` }, { status: 500 });
        }
      }
      isNewUser = true;
    }

    let pagosCreados = 0;
    let pagosActualizados = 0;

    for (const record of migrablesRecords) {
      if (record.estado !== "pagado" && record.estado !== "suspendido") continue;

      const pagoEstado = record.estado === "pagado" ? "aprobado" : "suspendido";

      const { data: existingPago } = await supabase
        .from("pagos")
        .select("id, estado")
        .eq("usuario_id", userId)
        .eq("mes_pagar", record.mes_pagar)
        .eq("anio_pagar", record.anio_pagar)
        .maybeSingle();

      if (existingPago) {
        if (existingPago.estado === "pendiente" || existingPago.estado === "suspendido") {
          const { error } = await supabase
            .from("pagos")
            .update({
              monto: montoMensual,
              estado: pagoEstado,
              notas: "Actualizado por migración de data",
              approved_at: pagoEstado === "aprobado" ? new Date().toISOString() : null,
            })
            .eq("id", existingPago.id);
          if (!error) pagosActualizados++;
        }
      } else {
        const { error } = await supabase
          .from("pagos")
          .insert({
            usuario_id: userId,
            monto: montoMensual,
            estado: pagoEstado,
            metodo_pago: "efectivo",
            tipo_pago: "membresia",
            mes_pagar: record.mes_pagar,
            anio_pagar: record.anio_pagar,
            notas: "Registro por migración de data",
            approved_at: pagoEstado === "aprobado" ? new Date().toISOString() : null,
          });
        if (!error) pagosCreados++;
      }
    }

    const { data: inscripcionExistente } = await supabase
      .from("pagos")
      .select("id")
      .eq("usuario_id", userId)
      .eq("tipo_pago", "inscripcion")
      .eq("anio_pagar", migrablesRecords[0]?.anio_pagar || new Date().getFullYear())
      .maybeSingle();

    if (!inscripcionExistente) {
      if (montoInscripcion > 0) {
        await supabase
          .from("pagos")
          .insert({
            usuario_id: userId,
            monto: montoInscripcion,
            estado: "aprobado",
            metodo_pago: "efectivo",
            tipo_pago: "inscripcion",
            mes_pagar: migrablesRecords[0]?.mes_pagar || 1,
            anio_pagar: migrablesRecords[0]?.anio_pagar || new Date().getFullYear(),
            notas: "Inscripción - Registro por migración de data",
            approved_at: new Date().toISOString(),
          });
      }
      await supabase
        .from("profiles")
        .update({
          inscripcion_pagada: true,
          inscripcion_fecha: new Date().toISOString().split("T")[0],
        })
        .eq("id", userId);
    }

    await supabase
      .from("migracion")
      .update({ migrado: "si" })
      .in("id", migrablesRecords.map((r: any) => r.id));

    const hasMigratedPayments = pagosCreados > 0 || pagosActualizados > 0;

    if (isNewUser || hasMigratedPayments) {
      let gymName = "GymApp";
      let gymLogo: string | null = null;
      try {
        const { data: config } = await supabase
          .from("gym_config")
          .select("nombre_gym, logo_url")
          .maybeSingle();
        if (config?.nombre_gym) gymName = config.nombre_gym;
        if (config?.logo_url) gymLogo = config.logo_url;
      } catch {}

      if (isNewUser) {
        // New user: generate confirmation token + send welcome email with credentials
        let confirmLink: string | null = null;
        try {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
          const token = randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

          await supabase.from("password_reset_tokens").insert({
            user_id: userId,
            token,
            expires_at: expiresAt,
          });

          confirmLink = `${siteUrl}/api/auth/confirm-email?token=${token}`;
        } catch {}

        try {
          await sendWelcomeEmail(email, email, password, gymName, gymLogo, confirmLink || undefined);
        } catch {}
      } else {
        // Existing user: no email needed, they already have an account
      }
    }

    return NextResponse.json({
      success: true,
      email,
      existingUser: !isNewUser,
      pagosCreados,
      pagosActualizados,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `${messages.migracion.errorServidor}: ${msg}` }, { status: 500 });
  }
}
