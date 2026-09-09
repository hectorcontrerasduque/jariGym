import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { getAdminLevel, isFullAdmin } from "@/lib/admin-level";
import { createOrUpdateUser } from "@/lib/services/miembros/profile.service";

const errorMap: Record<string, string> = {
  email_invalid: messages.miembros.emailInvalido,
  email_too_long: messages.miembros.emailDemasiadoLargo,
  name_required: messages.miembros.nombreRequerido,
  name_too_long: messages.miembros.nombreDemasiadoLargo,
  email_duplicate: messages.miembros.emailDuplicado,
  email_update_not_allowed: messages.toast.noAutorizado,
  email_update_failed: messages.toast.perfilError,
  current_password_required: messages.toast.contrasenaActualRequerida,
  current_password_wrong: messages.toast.contrasenaActualIncorrecta,
  password_update_failed: messages.toast.errorCambiarContrasena,
  profile_update_failed: messages.toast.perfilError,
};

export async function PUT(request: Request) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 30,
    windowMs: 60 * 60 * 1000,
    prefix: "api",
  });
  if (rateLimitResponse) return rateLimitResponse;

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

    const isAdmin = profileAdmin?.role === "super_admin";

    const body = await request.json();
    const { user_id, updates, password, currentPassword } = body;

    const targetUserId = user_id || user.id;

    if (user_id && user_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let fullAdmin = false;
    if (isAdmin) {
      const { data: existingConfig } = await serviceSupabase
        .from("gym_config")
        .select("owner_email")
        .single();
      const level = getAdminLevel(user.email, existingConfig?.owner_email || null, process.env.NEXT_PUBLIC_ADMIN_EMAIL);
      fullAdmin = isFullAdmin(level);
    }

    const result = await createOrUpdateUser(serviceSupabase, {
      id: targetUserId,
      email: updates.email || undefined,
      full_name: updates.full_name || "",
      phone_number: updates.phone_number,
      document_id: updates.document_id,
      arrival_time: updates.arrival_time,
      departure_time: updates.departure_time,
      role: fullAdmin ? updates.role : undefined,
      inscription_admin_note: fullAdmin ? updates.inscription_admin_note : undefined,
      start_date: updates.start_date || undefined,
      newPassword: password || undefined,
      currentPassword,
      isSuperAdmin: isAdmin,
      sendWelcome: isAdmin && updates.email,
    });

    return NextResponse.json({ profile: result.user });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    // eslint-disable-next-line security/detect-object-injection
    const msg = errorMap[code] || (err instanceof Error ? err.message : messages.toast.errorGenerico);
    const status = code === "email_duplicate" ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
