import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { createOrUpdateProfile } from "@/lib/services/miembros/profile.service";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 5,
    windowMs: 20 * 60 * 1000,
    prefix: "auth",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let isAuthorized = false;

  // Option 1: Validate JWT and check super_admin role
  if (token) {
    const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(token);
    if (!authError && user) {
      const { data: profile } = await serviceSupabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "super_admin") {
        isAuthorized = true;
      }
    }
  }

  // Option 2: CRON_SECRET (fallback for automated jobs/scripts)
  if (!isAuthorized) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && token === cronSecret) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { email, nombre, inscription_paid } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ created: false });
    }

    const emailLower = email.toLowerCase().trim();
    const nombreCompleto = (nombre && typeof nombre === "string" && nombre.trim()) || emailLower.split("@")[0];
    const isOwner = inscription_paid === true;

    const { data: existingProfile } = await serviceSupabase
      .from("profiles")
      .select("id, role, email, full_name")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.role !== "super_admin") {
        await serviceSupabase
          .from("profiles")
          .update({ role: "super_admin", activo: true, registered: true, full_name: nombreCompleto })
          .eq("id", existingProfile.id);
      }

      // Sync name/email to auth.users
      const authUpdates: { email?: string; user_metadata?: Record<string, string>; email_confirm?: boolean } = {};
      if (nombreCompleto && nombreCompleto !== existingProfile.full_name) {
        authUpdates.user_metadata = { full_name: nombreCompleto };
      }
      if (emailLower !== existingProfile.email) {
        authUpdates.email = emailLower;
        authUpdates.email_confirm = true;
      }
      if (authUpdates.email || authUpdates.user_metadata) {
        await serviceSupabase.auth.admin.updateUserById(existingProfile.id, authUpdates);
      }

      return NextResponse.json({ created: false, promoted: true });
    }

    // Profile doesn't exist — create auth user + profile
    const randomPassword = Math.random().toString(36).slice(-12) + "A1!";
    const { data: newUser, error: authError } = await serviceSupabase.auth.admin.createUser({
      email: emailLower,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: nombreCompleto },
    });

    let userId: string;

    if (authError) {
      if (authError.message?.includes("already") || authError.message?.includes("exists")) {
        const { data: existingProfileByEmail } = await serviceSupabase
          .from("profiles")
          .select("id")
          .eq("email", emailLower)
          .maybeSingle();
        if (!existingProfileByEmail) {
          return NextResponse.json({ created: false, error: authError.message });
        }
        userId = existingProfileByEmail.id;
      } else {
        return NextResponse.json({ created: false, error: authError.message });
      }
    } else {
      userId = newUser!.user!.id;
    }

    try {
      await createOrUpdateProfile(serviceSupabase, {
        id: userId,
        email: emailLower,
        full_name: nombreCompleto,
        role: "super_admin",
        inscription_paid: isOwner,
        inscription_date: isOwner ? new Date().toISOString().split("T")[0] : null,
      });
    } catch {
      return NextResponse.json({ created: false });
    }

    return NextResponse.json({ created: true });
  } catch {
    return NextResponse.json({ created: false });
  }
}
