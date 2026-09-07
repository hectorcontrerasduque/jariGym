import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { createOrUpdateUser } from "@/lib/services/miembros/profile.service";

const errorMap: Record<string, string> = {
  email_invalid: messages.miembros.emailInvalido,
  email_too_long: messages.miembros.emailDemasiadoLargo,
  name_required: messages.miembros.nombreRequerido,
  name_too_long: messages.miembros.nombreDemasiadoLargo,
  password_too_short: messages.migracion.passwordMinError,
  email_duplicate: messages.miembros.emailDuplicado,
  auth_user_create_failed: messages.toast.miembroError,
  profile_create_failed: messages.toast.miembroError,
};

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

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await createOrUpdateUser(serviceSupabase, {
      email,
      full_name: nombre,
      password: password || undefined,
      sendWelcome: true,
      isSuperAdmin: true,
    });

    return NextResponse.json({
      miembro: result.user,
      password: result.password,
      loginEmail: email,
      welcomeEmailSent: result.welcomeEmailSent || false,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    const msg = errorMap[code] || messages.toast.errorGenerico;
    const status = code === "email_duplicate" ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
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