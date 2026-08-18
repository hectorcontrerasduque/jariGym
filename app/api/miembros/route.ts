import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: profileAdmin } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileAdmin?.role !== "super_admin" && profileAdmin?.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { email, nombre, username, password } = await request.json();

    if (!nombre) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }

    const hasEmail = !!email;
    const isGmail = hasEmail && email.toLowerCase().endsWith("@gmail.com");

    if (!hasEmail && (!username || !password)) {
      return NextResponse.json(
        { error: "Si no se ingresa correo, usuario y contraseña son requeridos" },
        { status: 400 }
      );
    }

    if (hasEmail && !isGmail && (!username || !password)) {
      return NextResponse.json(
        { error: "Para correos no-Gmail, usuario y contraseña son requeridos" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const userPassword = (!hasEmail || isGmail)
      ? (password || Math.random().toString(36).slice(-12) + "A1!")
      : password;

    const userEmail = hasEmail && isGmail
      ? email
      : hasEmail
      ? email
      : `${username}@gymapp.local`;

    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      password: userPassword,
      user_metadata: { nombre_completo: nombre, display_email: email },
    });

    if (authError) {
      console.error("Auth error:", authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const profileData: Record<string, unknown> = {
      id: authUser.user.id,
      nombre_completo: nombre,
      role: "miembro",
    };
    if (hasEmail) {
      profileData.email = email;
    }

    const { data, error: profileError } = await serviceSupabase
      .from("profiles")
      .upsert(profileData, { onConflict: "id" })
      .select()
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    let welcomeEmailSent = false;
    if (hasEmail) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
          data: { nombre_completo: nombre },
          redirectTo: `${siteUrl}/login`,
        });
        if (!inviteError) {
          welcomeEmailSent = true;
        } else {
          console.error("Invite email error:", inviteError);
        }
      } catch (emailErr) {
        console.error("Error sending welcome email:", emailErr);
      }
    }

    return NextResponse.json({
      miembro: data,
      password: userPassword,
      loginEmail: userEmail,
      welcomeEmailSent,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
