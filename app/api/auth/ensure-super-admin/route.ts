import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, nombre } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ created: false });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const emailLower = email.toLowerCase().trim();
    const nombreCompleto = (nombre && typeof nombre === "string" && nombre.trim()) || emailLower.split("@")[0];

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.role !== "super_admin") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin", activo: true, registered: true, nombre_completo: nombreCompleto })
          .eq("id", existingProfile.id);
      }
      return NextResponse.json({ created: false, promoted: true });
    }

    const { data: existingAuth } = await supabase.auth.admin.listUsers();
    const authUser = existingAuth?.users?.find((u) => u.email === emailLower);

    let userId: string;

    if (authUser) {
      userId = authUser.id;
    } else {
      const randomPassword = Math.random().toString(36).slice(-12) + "A1!";
      const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
        email: emailLower,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { nombre_completo: nombreCompleto },
      });

      if (authError || !newUser?.user?.id) {
        return NextResponse.json({ created: false, error: authError?.message });
      }
      userId = newUser.user.id;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email: emailLower,
        nombre_completo: nombreCompleto,
        role: "super_admin",
        activo: true,
        registered: true,
        fecha_inscripcion: new Date().toISOString().split("T")[0],
        inscripcion_pagada: true,
        inscripcion_fecha: new Date().toISOString().split("T")[0],
      });

    if (profileError) {
      if (profileError.code === "23505") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin", activo: true, registered: true, nombre_completo: nombreCompleto })
          .eq("email", emailLower);
        return NextResponse.json({ created: false, promoted: true });
      }
      return NextResponse.json({ created: false, error: profileError.message });
    }

    return NextResponse.json({ created: true });
  } catch {
    return NextResponse.json({ created: false });
  }
}
