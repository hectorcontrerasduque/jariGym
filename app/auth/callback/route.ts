import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error("OAuth error:", error, errorDescription);
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

      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("Code exchange error:", exchangeError?.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
