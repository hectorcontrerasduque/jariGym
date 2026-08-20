import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { sendWelcomeEmail } from "@/lib/services/email/email.service";

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
        { error: "Falta configuración del gym. Vaya a Configuración y guarde los datos antes de migrar." },
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
        return NextResponse.json({ error: messages.migracion.noResults }, { status: 404 });
      }
      migracionRecords = data;
    } else {
      return NextResponse.json({ error: messages.migracion.noResults }, { status: 404 });
    }

    let userId: string;
    let isNewUser = false;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      userId = existingProfile.id;
    } else {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { nombre_completo: nombre },
      });

      if (authError) {
        if (authError.message?.includes("already") || authError.message?.includes("exists")) {
          return NextResponse.json({ error: messages.migracion.emailExistsError }, { status: 400 });
        }
        return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
      }

      if (!authUser?.user?.id) {
        return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
      }

      userId = authUser.user.id;

      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email,
          nombre_completo: nombre,
          whatsapp,
          role: "miembro",
          activo: true,
          registered: true,
          fecha_inscripcion: "2026-01-01",
          inscripcion_pagada: false,
        });

      if (profileError) {
        await supabase.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
      }

      isNewUser = true;
    }

    let pagosCreados = 0;
    let pagosActualizados = 0;

    for (const record of migracionRecords) {
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
      .eq("anio_pagar", migracionRecords[0]?.anio_pagar || new Date().getFullYear())
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
            mes_pagar: migracionRecords[0]?.mes_pagar || 1,
            anio_pagar: migracionRecords[0]?.anio_pagar || new Date().getFullYear(),
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
      .in("id", migracionRecords.map((r: any) => r.id));

    if (isNewUser) {
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

      let confirmLink: string | undefined;
      try {
        const { data: linkData } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        if (linkData?.properties?.action_link) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
          confirmLink = `${siteUrl}/auth/callback?next=/login`;
        }
      } catch {}

      try {
        await sendWelcomeEmail(email, email, password, gymName, gymLogo, confirmLink);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      email,
      existingUser: !isNewUser,
      pagosCreados,
      pagosActualizados,
    });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
