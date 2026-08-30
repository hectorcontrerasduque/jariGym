import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 5,
    windowMs: 20 * 60 * 1000,
    prefix: "auth",
  });
  if (rateLimitResponse) return rateLimitResponse;
  
  // SECURITY: Require authentication - either CRON_SECRET or super_admin JWT
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[ensure-super-admin] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let isAuthorized = false;

  // Option 1: CRON_SECRET (for automated jobs/scripts)
  if (authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    // Option 2: Validate JWT and check super_admin role
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (!authError && user) {
      const { data: profile } = await supabase
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
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { email, nombre, inscription_paid } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ created: false });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const emailLower = email.toLowerCase().trim();
    const nombreCompleto = (nombre && typeof nombre === "string" && nombre.trim()) || emailLower.split("@")[0];
    const isOwner = inscription_paid === true;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.role !== "super_admin") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin", activo: true, registered: true, full_name: nombreCompleto })
          .eq("id", existingProfile.id);
      }
      return NextResponse.json({ created: false, promoted: true });
    }

    const randomPassword = Math.random().toString(36).slice(-12) + "A1!";
    const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: nombreCompleto },
    });

    let userId: string;

    if (authError) {
      if (authError.message?.includes("already") || authError.message?.includes("exists")) {
        // SECURITY: Avoid listUsers() - fetches ALL auth users (DoS vector)
        // Instead, find by email in profiles table (unique index)
        const { data: existingProfileByEmail } = await supabase
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

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email: emailLower,
        full_name: nombreCompleto,
        role: "super_admin",
        activo: true,
        registered: true,
        start_date: new Date().toISOString().split("T")[0],
        inscription_paid: isOwner,
        inscription_date: isOwner ? new Date().toISOString().split("T")[0] : null,
      });

    if (profileError) {
      if (profileError.code === "23505") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin", activo: true, registered: true, full_name: nombreCompleto })
          .eq("email", emailLower);
        return NextResponse.json({ created: false, promoted: true });
      }
      return NextResponse.json({ created: false, error: profileError.message });
    }

    return NextResponse.json({ created: true });
  } catch {
    return NextResponse.json({ created: false });
  }
}
