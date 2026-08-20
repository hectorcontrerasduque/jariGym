import { createClient } from "@/lib/supabase/server";
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

      const { data: gymConfig } = await supabase
        .from("gym_config")
        .select("dueno_email")
        .limit(1)
        .single();

      const isGymOwner = gymConfig?.dueno_email && user.email === gymConfig.dueno_email;

      if (isGymOwner && profile?.role !== "super_admin") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin" })
          .eq("id", user.id);
        if (profile) profile.role = "super_admin";
      }

      const isAdmin = isAdminByEmail || profile?.role === "super_admin" || profile?.role === "admin";
      const isActiveMember = profile?.activo !== false && profile?.role === "miembro";

      if (!isAdmin && !isGymOwner && !isActiveMember) {
        await supabase.auth.signOut();
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}`);
      }

      const redirectPath = isAdmin || isGymOwner ? next : (next === "/dashboard" ? "/dashboard/mis-pagos" : next);

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
