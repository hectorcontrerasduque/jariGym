import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { createOrUpdateUser } from "@/lib/services/miembros/profile.service";
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

    const { data: existingProfile } = await serviceSupabase
      .from("profiles")
      .select("id, role")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.role !== "super_admin") {
        await serviceSupabase
          .from("profiles")
          .update({ role: "super_admin", activo: true, registered: true, full_name: nombreCompleto })
          .eq("id", existingProfile.id);
      }
      return NextResponse.json({ created: false, promoted: true });
    }

    await createOrUpdateUser(serviceSupabase, {
      email: emailLower,
      full_name: nombreCompleto,
      generatePassword: true,
      role: "super_admin",
      inscription_paid: inscription_paid === true,
      inscription_date: inscription_paid === true ? new Date().toISOString().split("T")[0] : null,
      isSuperAdmin: true,
      sendWelcome: true,
    });

    return NextResponse.json({ created: true });
  } catch {
    return NextResponse.json({ created: false });
  }
}
