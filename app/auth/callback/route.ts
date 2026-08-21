import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/dashboard";
  const allowedPaths = ["/dashboard", "/dashboard/mis-pagos", "/dashboard/perfil", "/dashboard/reportar-pago", "/dashboard/pagos", "/dashboard/miembros", "/dashboard/configuracion", "/reset-password", "/login"];
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
      // Email confirmation flow: next=/login means just confirm email, then redirect to login with success
      if (next === "/login") {
        await supabase.auth.signOut();
        const msg = encodeURIComponent(messages.auth.emailConfirmed);
        return NextResponse.redirect(`${origin}/login?message=${msg}`);
      }

      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
      const email = user.email || null;
      const nombre = user.user_metadata?.nombre_completo || user.user_metadata?.full_name || null;

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
      const isAdminByEmail = adminEmail && user.email === adminEmail;

      const { data: gymConfig } = await supabase
        .from("gym_config")
        .select("dueno_email")
        .limit(1)
        .single();

      const isGymOwner = gymConfig?.dueno_email && user.email?.toLowerCase() === gymConfig.dueno_email.toLowerCase();

      const serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      let { data: profile } = await supabase
        .from("profiles")
        .select("role, activo, registered")
        .eq("id", user.id)
        .single();

      if (isAdminByEmail || isGymOwner) {
        if (profile && profile.role !== "super_admin") {
          await serviceSupabase
            .from("profiles")
            .update({ role: "super_admin", registered: true, activo: true })
            .eq("id", user.id);
          profile.role = "super_admin";
          profile.registered = true;
        }

        if (!profile) {
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
                registered: true,
                fecha_inscripcion: new Date().toISOString().split("T")[0],
                inscripcion_pagada: isGymOwner,
                inscripcion_fecha: isGymOwner ? new Date().toISOString().split("T")[0] : null,
              });

            const { data: retry } = await supabase
              .from("profiles")
              .select("role, activo, registered")
              .eq("id", user.id)
              .single();
            if (retry) profile = retry;
          }
        }
      }

      if (!profile) {
        await supabase.auth.signOut();
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}`);
      }

      const isAdmin = isAdminByEmail || profile.role === "super_admin" || profile.role === "admin";
      const isActiveMember = profile.activo !== false && profile.registered === true && profile.role === "miembro";

      if (!isAdmin && !isActiveMember) {
        if (profile.registered === false) {
          await serviceSupabase
            .from("profiles")
            .delete()
            .eq("id", user.id);
        }
        await supabase.auth.signOut();
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}`);
      }

      if (profile) {
        // Only update avatar and email, never overwrite nombre_completo on existing profiles
        const updates: Record<string, unknown> = {};
        if (avatarUrl) updates.avatar_url = avatarUrl;
        if (email) updates.email = email;

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("profiles")
            .update(updates)
            .eq("id", user.id);
        }
      }

      const redirectPath = isAdmin ? next : (next === "/dashboard" ? "/dashboard/mis-pagos" : next);

      // Super admin sin config: redirigir a configuracion
      if (isAdmin && !gymConfig && redirectPath === "/dashboard") {
        return NextResponse.redirect(`${origin}/dashboard/configuracion`);
      }

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
