import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { createOrUpdateProfile } from "@/lib/services/miembros/profile.service";

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

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
      const isAdminByEmail = adminEmail && user.email === adminEmail;

      const { data: gymConfig } = await supabase
        .from("gym_config")
        .select("owner_email")
        .limit(1)
        .single();

      const isGymOwner = gymConfig?.owner_email && user.email?.toLowerCase() === gymConfig.owner_email.toLowerCase();

      const serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      let { data: profile } = await supabase
        .from("profiles")
        .select("role, activo, registered")
        .eq("id", user.id)
        .single();

      // Query profiles by email for debug + fix (helps when ID doesn't match)
      const { data: profilesByEmail } = await serviceSupabase
        .from("profiles")
        .select("id, role, activo, registered")
        .eq("email", user.email);

      console.log("[AUTH_CALLBACK]", JSON.stringify({
        step: "START",
        auth_user_id: user.id,
        email: user.email,
        profile_by_id: profile ? { role: profile.role, activo: profile.activo, registered: profile.registered } : null,
        profiles_by_email: profilesByEmail?.map(p => ({ id: p.id, role: p.role, registered: p.registered })) ?? [],
        profiles_by_email_count: profilesByEmail?.length ?? 0,
        adminEmail,
        isAdminByEmail,
        gymOwnerEmail: gymConfig?.owner_email ?? null,
        isGymOwner,
        supabaseProject: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? "unknown",
      }));

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
          // Profile not found by auth user ID — try to recover by email
          const existingByEmail = profilesByEmail?.[0];

          if (existingByEmail) {
            // Profile exists with this email but different ID — create new profile for current auth user
            console.log("[AUTH_CALLBACK]", JSON.stringify({
              step: "RECOVER_BY_EMAIL",
              existing_profile_id: existingByEmail.id,
              auth_user_id: user.id,
              action: "create_new_profile_for_auth_user",
            }));
            await createOrUpdateProfile(serviceSupabase, {
              id: user.id,
              email: user.email || "",
              full_name: user.user_metadata?.full_name || user.email || "",
              avatar_url: avatarUrl,
              role: "super_admin",
            });
          } else {
            // No profile with this email at all — create directly for auth user
            console.log("[AUTH_CALLBACK]", JSON.stringify({
              step: "CREATE_NEW",
              auth_user_id: user.id,
              action: "create_profile_directly",
            }));
            await createOrUpdateProfile(serviceSupabase, {
              id: user.id,
              email: user.email || "",
              full_name: user.user_metadata?.full_name || user.email || "",
              avatar_url: avatarUrl,
              role: "super_admin",
            });
          }

          const { data: retry } = await supabase
            .from("profiles")
            .select("role, activo, registered")
            .eq("id", user.id)
            .single();
          if (retry) profile = retry;
        }
      }

      if (!profile) {
        console.log("[AUTH_CALLBACK]", JSON.stringify({
          step: "PROFILE_NULL",
          auth_user_id: user.id,
          email: user.email,
          profiles_by_email_count: profilesByEmail?.length ?? 0,
          profiles_by_email_ids: profilesByEmail?.map(p => p.id) ?? [],
          supabaseProject: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? "unknown",
        }));
        await supabase.auth.signOut();
        const debug = encodeURIComponent(JSON.stringify({
          path: "PROFILE_NULL",
          user_id: user.id,
          email: user.email,
          adminEmail,
          isAdminByEmail,
          isGymOwner,
          gymOwnerEmail: gymConfig?.owner_email ?? null,
        }));
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}&debug=${debug}`);
      }

      const isAdmin = isAdminByEmail || profile.role === "super_admin";
      const isActiveMember = profile.activo !== false && profile.registered === true && profile.role === "miembro";

      if (!isAdmin && !isActiveMember) {
        console.log("[AUTH_CALLBACK]", JSON.stringify({
          step: "NOT_AUTHORIZED",
          auth_user_id: user.id,
          email: user.email,
          profile_role: profile.role,
          profile_activo: profile.activo,
          profile_registered: profile.registered,
          isAdmin,
          isActiveMember,
          supabaseProject: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? "unknown",
        }));
        if (profile.registered === false) {
          await serviceSupabase
            .from("profiles")
            .delete()
            .eq("id", user.id);
        }
        await supabase.auth.signOut();
        const debug = encodeURIComponent(JSON.stringify({
          path: "NOT_AUTHORIZED",
          user_id: user.id,
          email: user.email,
          adminEmail,
          isAdminByEmail,
          isGymOwner,
          gymOwnerEmail: gymConfig?.owner_email ?? null,
          profile_role: profile.role,
          profile_activo: profile.activo,
          profile_registered: profile.registered,
          isAdmin,
          isActiveMember,
        }));
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}&debug=${debug}`);
      }

      if (profile) {
        // Only update avatar and email, never overwrite full_name on existing profiles
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

      console.log("[AUTH_CALLBACK]", JSON.stringify({
        step: "SUCCESS",
        auth_user_id: user.id,
        email: user.email,
        profile_role: profile.role,
        profile_activo: profile.activo,
        profile_registered: profile.registered,
        isAdmin,
        redirectPath,
        supabaseProject: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? "unknown",
      }));

      // Super admin sin config: redirigir a configuracion
      if (isAdmin && !gymConfig && redirectPath === "/dashboard") {
        return NextResponse.redirect(`${origin}/dashboard/configuracion`);
      }

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("auth_failed")}&debug=${encodeURIComponent(JSON.stringify({ path: "EXCHANGE_FAILED", code: code ? "present" : "null", error, errorDescription }))}`);
}
