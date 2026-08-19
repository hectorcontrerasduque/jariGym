import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const { data: profileAdmin } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileAdmin?.role !== "super_admin" && profileAdmin?.role !== "admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const { email, nombre, password } = await request.json();

    if (!nombre) {
      return NextResponse.json({ error: messages.miembros.nombreRequerido }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: messages.miembros.correoRequerido }, { status: 400 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const isGmail = email.toLowerCase().endsWith("@gmail.com");
    const userPassword = password || randomBytes(12).toString("base64url").slice(0, 16);

    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.createUser({
      email: email,
      email_confirm: true,
      password: userPassword,
      user_metadata: { nombre_completo: nombre, display_email: email },
    });

    let userId = authUser?.user?.id;

    if (authError) {
      if (authError.message?.includes("already") || authError.message?.includes("exists")) {
        const { data: existingProfile } = await serviceSupabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (existingProfile) {
          userId = existingProfile.id;
        } else {
          return NextResponse.json({ error: messages.toast.miembroError }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: messages.toast.miembroError }, { status: 400 });
      }
    }

    if (!userId) {
      return NextResponse.json({ error: messages.miembros.errorObtenerUsuario }, { status: 500 });
    }

    const { data, error: rpcError } = await serviceSupabase
      .rpc("crear_miembro_completo", {
        p_user_id: userId,
        p_nombre: nombre,
        p_email: email,
        p_changed_by: user.id,
      });

    if (rpcError) {
      return NextResponse.json({ error: messages.toast.miembroError }, { status: 400 });
    }

    let welcomeEmailSent = false;
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
        data: { nombre_completo: nombre },
        redirectTo: `${siteUrl}/login`,
      });
      if (!inviteError) {
        welcomeEmailSent = true;
      } else {
        const { error: resetError } = await serviceSupabase.auth.admin.generateLink({
          type: "magiclink",
          email: email,
        });
        if (!resetError) {
          welcomeEmailSent = true;
        }
      }
    } catch (emailErr) {
      // Email error non-critical
    }

    return NextResponse.json({
      miembro: data,
      password: userPassword,
      loginEmail: email,
      welcomeEmailSent,
    });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
