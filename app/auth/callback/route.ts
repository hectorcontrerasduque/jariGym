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
    try {
      const supabase = await createClient();
      const { data: { user }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError || !user) {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("auth_failed")}&debug=${encodeURIComponent(JSON.stringify({ path: "EXCHANGE_FAILED", error: exchangeError?.message }))}`);
      }

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
        .maybeSingle();

      const isGymOwner = gymConfig?.owner_email && user.email?.toLowerCase() === gymConfig.owner_email.toLowerCase();

      const serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const supabaseProject = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? "unknown";

      let { data: profile } = await supabase
        .from("profiles")
        .select("role, activo, registered")
        .eq("id", user.id)
        .single();

      // Query profiles by email for debug + fix (helps when ID doesn't match)
      let profilesByEmailDebug: { id: string; role: string; activo: boolean | null; registered: boolean }[] = [];
      try {
        const { data: profilesByEmail } = await serviceSupabase
          .from("profiles")
          .select("id, role, activo, registered")
          .eq("email", user.email);
        profilesByEmailDebug = profilesByEmail?.map(p => ({
          id: p.id, role: p.role, activo: p.activo, registered: p.registered,
        })) ?? [];
      } catch {
        profilesByEmailDebug = [];
      }

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
          try {
            await createOrUpdateProfile(serviceSupabase, {
              id: user.id,
              email: user.email || "",
              full_name: user.user_metadata?.full_name || user.email || "",
              avatar_url: avatarUrl,
              role: "super_admin",
            });
          } catch (createError: unknown) {
            const err = createError as Record<string, unknown>;
            const errObj = (typeof err === "object" && err !== null && "error" in err) ? err.error as Record<string, unknown> : err;
            await supabase.auth.signOut();
            const debug = encodeURIComponent(JSON.stringify({
              path: "PROFILE_CREATE_FAILED",
              auth_user_id: user.id,
              email: user.email,
              adminEmail,
              isAdminByEmail,
              isGymOwner,
              gymOwnerEmail: gymConfig?.owner_email ?? null,
              supabaseProject,
              profiles_by_email: profilesByEmailDebug,
              error_message: errObj?.message || err?.message || String(createError),
              error_code: errObj?.code || err?.code || null,
              error_details: errObj?.details || err?.details || null,
              error_hint: errObj?.hint || err?.hint || null,
            }));
            const msg = encodeURIComponent(messages.auth.userNotRegistered);
            return NextResponse.redirect(`${origin}/login?error=${msg}&debug=${debug}`);
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
        await supabase.auth.signOut();
        const debug = encodeURIComponent(JSON.stringify({
          path: "PROFILE_NULL",
          auth_user_id: user.id,
          email: user.email,
          adminEmail,
          isAdminByEmail,
          isGymOwner,
          gymOwnerEmail: gymConfig?.owner_email ?? null,
          supabaseProject,
          profile_by_id: null,
          profiles_by_email: profilesByEmailDebug,
        }));
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}&debug=${debug}`);
      }

      const isAdmin = isAdminByEmail || profile.role === "super_admin";
      const isActiveMember = profile.activo !== false && profile.registered === true && profile.role === "miembro";

      if (!isAdmin && !isActiveMember) {
        if (profile.registered === false) {
          await serviceSupabase
            .from("profiles")
            .delete()
            .eq("id", user.id);
        }
        await supabase.auth.signOut();
        const debug = encodeURIComponent(JSON.stringify({
          path: "NOT_AUTHORIZED",
          auth_user_id: user.id,
          email: user.email,
          adminEmail,
          isAdminByEmail,
          isGymOwner,
          gymOwnerEmail: gymConfig?.owner_email ?? null,
          supabaseProject,
          profile_by_id: { role: profile.role, activo: profile.activo, registered: profile.registered },
          profiles_by_email: profilesByEmailDebug,
          isAdmin,
          isActiveMember,
        }));
        const msg = encodeURIComponent(messages.auth.userNotRegistered);
        return NextResponse.redirect(`${origin}/login?error=${msg}&debug=${debug}`);
      }

      if (profile) {
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

      const debug = encodeURIComponent(JSON.stringify({
        path: "SUCCESS",
        auth_user_id: user.id,
        email: user.email,
        supabaseProject,
        profile_by_id: { role: profile.role, activo: profile.activo, registered: profile.registered },
        profiles_by_email: profilesByEmailDebug,
        isAdmin,
        redirectPath,
      }));

      if (isAdmin && !gymConfig && redirectPath === "/dashboard") {
        return NextResponse.redirect(`${origin}/dashboard/configuracion?debug=${debug}`);
      }

      return NextResponse.redirect(`${origin}${redirectPath}?debug=${debug}`);

    } catch (globalError) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("auth_callback_error")}&debug=${encodeURIComponent(JSON.stringify({
        path: "GLOBAL_ERROR",
        error: globalError instanceof Error ? globalError.message : String(globalError),
      }))}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("auth_failed")}&debug=${encodeURIComponent(JSON.stringify({ path: "NO_CODE" }))}`);
}
