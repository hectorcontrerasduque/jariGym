import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { sendWelcomeEmail } from "@/lib/services/email/email.service";
import { configService } from "@/lib/services/config/config.service";

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

    const searchName = selectedNombre || nombre;
    const words = searchName.split(/\s+/).filter((w: string) => w.length >= 2);
    let migracionRecords;

    if (words.length > 0) {
      const orFilter = words.map((w: string) => `nombre.ilike.%${w}%`).join(",");
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
    let pagosSuspendidos = 0;

    for (const record of migracionRecords) {
      if (record.estado === "pagado") {
        const { error } = await supabase
          .from("pagos")
          .insert({
            usuario_id: userId,
            monto: 0,
            estado: "aprobado",
            metodo_pago: "efectivo",
            mes_pagar: record.mes_pagar,
            anio_pagar: record.anio_pagar,
            notas: "Registro por migración de data",
            approved_at: new Date().toISOString(),
          });
        if (!error) pagosCreados++;
      } else if (record.estado === "suspendido") {
        const { error } = await supabase
          .from("pagos")
          .insert({
            usuario_id: userId,
            monto: 0,
            estado: "suspendido",
            metodo_pago: "efectivo",
            mes_pagar: record.mes_pagar,
            anio_pagar: record.anio_pagar,
            notas: "Registro por migración de data - suspendido",
          });
        if (!error) pagosSuspendidos++;
      }
    }

    await supabase
      .from("migracion")
      .update({ migrado: "si" })
      .in("id", migracionRecords.map((r: any) => r.id));

    if (isNewUser) {
      let gymName = "GymApp";
      let gymLogo: string | null = null;
      try {
        const config = await configService.getConfig();
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
      pagosSuspendidos,
    });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
