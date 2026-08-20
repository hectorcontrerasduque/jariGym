import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/dashboard";
  const allowedPaths = ["/dashboard", "/dashboard/mis-pagos", "/dashboard/perfil", "/dashboard/reportar-pago", "/dashboard/pagos", "/dashboard/miembros", "/dashboard/configuracion", "/reset-password"];
  const next = allowedPaths.includes(nextRaw) ? nextRaw : "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { data: { user }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError && user) {
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
      const email = user.email || null;
      const nombre = user.user_metadata?.nombre_completo || user.user_metadata?.full_name || null;

      const updates: Record<string, unknown> = {};
      if (avatarUrl) updates.avatar_url = avatarUrl;
      if (email) updates.email = email;
      if (nombre) updates.nombre_completo = nombre;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("profiles")
          .update(updates)
          .eq("id", user.id);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, activo")
        .eq("id", user.id)
        .single();

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
      const isAdminByEmail = adminEmail && user.email === adminEmail;

      let { data: profile } = await supabase
        .from("profiles")
        .select("role, activo")
        .eq("id", user.id)
        .single();

      const { data: gymConfig } = await supabase
        .from("gym_config")
        .select("dueno_email")
        .limit(1)
        .single();

      const isGymOwner = gymConfig?.dueno_email && user.email === gymConfig.dueno_email;

      if (!profile && (isAdminByEmail || isGymOwner)) {
        const serviceSupabase = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const randomPassword = Math.random().toString(36).slice(-12) + "A1!";
        const { data: newUser } = await serviceSupabase.auth.admin.createUser({
          email: user.email!,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { nombre_completo: user.user_metadata?.full_name || user.email },
        });

        if (newUser?.user?.id) {
          await serviceSupabase
            .from("profiles")
            .insert({
              id: newUser.user.id,
              email: user.email,
              nombre_completo: user.user_metadata?.full_name || user.email,
              avatar_url: avatarUrl,
              role: "super_admin",
              activo: true,
              fecha_inscripcion: "2026-01-01",
              inscripcion_pagada: false,
            });

          const { data: retry } = await supabase
            .from("profiles")
            .select("role, activo")
            .eq("id", user.id)
            .single();
          if (retry) profile = retry;
        }
      }

      if (isGymOwner && profile.role !== "super_admin") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin" })
          .eq("id", user.id);
        profile.role = "super_admin";
      }

      const isAdmin = isAdminByEmail || profile.role === "super_admin" || profile.role === "admin";
      const isActiveMember = profile.activo !== false && profile.role === "miembro";

      if (!isAdmin && !isActiveMember) {
        await supabase.auth.signOut();
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}`);
      }

      const redirectPath = isAdmin ? next : (next === "/dashboard" ? "/dashboard/mis-pagos" : next);

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
