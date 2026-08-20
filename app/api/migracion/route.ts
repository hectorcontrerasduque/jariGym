import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { sendWelcomeEmail } from "@/lib/services/email/email.service";
import { configService } from "@/lib/services/config/config.service";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

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

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existingProfile } = await serviceSupabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ error: messages.migracion.emailExistsError }, { status: 400 });
    }

    const searchName = selectedNombre || nombre;
    const { data: migracionRecords, error: migracionError } = await serviceSupabase
      .from("migracion")
      .select("*")
      .ilike("nombre", `%${searchName}%`)
      .eq("migrado", "no")
      .order("mes_pagar", { ascending: true });

    if (migracionError || !migracionRecords || migracionRecords.length === 0) {
      return NextResponse.json({ error: messages.migracion.noResults }, { status: 404 });
    }

    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.createUser({
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

    const userId = authUser.user.id;

    const { error: profileError } = await serviceSupabase
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
      await serviceSupabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
    }

    let pagosCreados = 0;
    let pagosSuspendidos = 0;

    for (const record of migracionRecords) {
      if (record.estado === "pagado") {
        const { error } = await serviceSupabase
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
        const { error } = await serviceSupabase
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

    await serviceSupabase
      .from("migracion")
      .update({ migrado: "si" })
      .in("id", migracionRecords.map((r) => r.id));

    let gymName = "GymApp";
    let gymLogo: string | null = null;
    try {
      const config = await configService.getConfig();
      if (config?.nombre_gym) gymName = config.nombre_gym;
      if (config?.logo_url) gymLogo = config.logo_url;
    } catch {}

    let confirmLink: string | undefined;
    try {
      const { data: linkData } = await serviceSupabase.auth.admin.generateLink({
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

    return NextResponse.json({
      success: true,
      email,
      pagosCreados,
      pagosSuspendidos,
    });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
