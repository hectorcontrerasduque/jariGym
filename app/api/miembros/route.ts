import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { randomBytes } from "crypto";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

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

    if (profileAdmin?.role !== "super_admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const rateLimitResponse = await applyRateLimit(request, {
      max: 30,
      windowMs: 60 * 60 * 1000,
      prefix: "api",
    }, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { email, nombre, password } = await request.json();

    if (!nombre) {
      return NextResponse.json({ error: messages.miembros.nombreRequerido }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: messages.miembros.correoRequerido }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: messages.miembros.emailInvalido }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: messages.miembros.emailDemasiadoLargo }, { status: 400 });
    }
    if (nombre.length > 200) {
      return NextResponse.json({ error: messages.miembros.nombreDemasiadoLargo }, { status: 400 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Proactive duplicate email check
    const { data: existingProfile } = await serviceSupabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ error: messages.miembros.emailDuplicado }, { status: 409 });
    }

    const userPassword = password || randomBytes(12).toString("base64url").slice(0, 16);

    const { data: { users }, error: listError } = await serviceSupabase.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json({ error: messages.toast.miembroError }, { status: 400 });
    }

    const existingAuthUser = users?.find(u => u.email === email);

    if (existingAuthUser) {
      const orphanedUserId = existingAuthUser.id;

      const { data: profileData, error: profileError } = await serviceSupabase
        .from("profiles")
        .upsert({
          id: orphanedUserId,
          full_name: nombre,
          email: email,
          role: "miembro",
          inscription_paid: false,
        }, { onConflict: "id" })
        .select()
        .single();

      if (profileError) {
        return NextResponse.json({ error: messages.toast.miembroError }, { status: 400 });
      }

      if (password) {
        try {
          await serviceSupabase.auth.admin.updateUserById(orphanedUserId, { password });
        } catch {
          // silent
        }
      }

      return NextResponse.json({
        miembro: profileData,
        password,
        loginEmail: email,
        welcomeEmailSent: false,
      });
    }

    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.createUser({
      email: email,
      email_confirm: true,
      password: userPassword,
      user_metadata: { full_name: nombre, display_email: email },
    });

    const userId = authUser?.user?.id;

    if (authError) {
      return NextResponse.json({ error: authError.message || messages.toast.miembroError }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: messages.miembros.errorObtenerUsuario }, { status: 500 });
    }

    const { data: profileData, error: profileError } = await serviceSupabase
      .from("profiles")
      .upsert({
        id: userId,
        full_name: nombre,
        email: email,
        role: "miembro",
        inscription_paid: false,
      }, { onConflict: "id" })
      .select()
      .single();

    if (profileError) {
      await serviceSupabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: messages.toast.miembroError }, { status: 400 });
    }

    let welcomeEmailSent = false;
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: nombre },
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
    } catch {
      // silent
    }

    return NextResponse.json({
      miembro: profileData,
      password: userPassword,
      loginEmail: email,
      welcomeEmailSent,
    });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

    if (profileAdmin?.role !== "super_admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("id");

    if (!memberId) {
      return NextResponse.json({ error: messages.miembros.errorObtenerUsuario }, { status: 400 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { count } = await serviceSupabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", memberId);

    if (count && count > 0) {
      return NextResponse.json({ error: messages.miembros.tienePagosNoEliminar }, { status: 409 });
    }

    const { error: profileError } = await serviceSupabase
      .from("profiles")
      .delete()
      .eq("id", memberId);

    if (profileError) {
      return NextResponse.json({ error: messages.miembros.miembroEliminadoError }, { status: 500 });
    }

    await serviceSupabase.auth.admin.deleteUser(memberId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}