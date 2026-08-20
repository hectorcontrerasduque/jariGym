import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=Token+no+proporcionado`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tokenRow, error: tokenError } = await supabase
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return NextResponse.redirect(`${origin}/login?error=Enlace+invalido+o+ya+utilizado`);
  }

  if (tokenRow.used_at) {
    return NextResponse.redirect(`${origin}/login?error=Enlace+ya+utilizado`);
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.redirect(`${origin}/login?error=Enlace+expirado.+Solicita+uno+nuevo`);
  }

  // Mark token as used
  await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  // Confirm the email in auth.users
  await supabase.auth.admin.updateUserById(tokenRow.user_id, {
    email_confirm: true,
  });

  const msg = encodeURIComponent("Correo confirmado. Ya puedes iniciar sesión");
  return NextResponse.redirect(`${origin}/login?message=${msg}`);
}
