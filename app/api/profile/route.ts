import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

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

    const { data: currentData } = await serviceSupabase
      .from("profiles")
      .select("full_name, email, phone_number, document_id, arrival_time, departure_time, inscription_admin_note")
      .eq("id", targetUserId)
      .single();

    const profileUpdates: Record<string, unknown> = {
      full_name: updates.full_name ?? currentData?.full_name,
      email: updates.email ?? currentData?.email,
      phone_number: updates.phone_number ?? currentData?.phone_number,
      document_id: updates.document_id ?? currentData?.document_id,
      arrival_time: updates.arrival_time ?? currentData?.arrival_time,
      departure_time: updates.departure_time ?? currentData?.departure_time,
    };
    if (isAdmin) {
      profileUpdates.role = updates.role;
      profileUpdates.inscription_admin_note = updates.inscription_admin_note ?? currentData?.inscription_admin_note;
    }

    const { data, error: profileError } = await serviceSupabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", targetUserId)
      .select()
      .single();

    if (profileError) {
      return NextResponse.json({ error: `${messages.toast.perfilError}: ${profileError.message}` }, { status: 400 });
    }

    // Sync email to auth.users if it changed
    if (data.email && currentData?.email && data.email !== currentData.email) {
      await serviceSupabase.auth.admin.updateUserById(
        targetUserId,
        { email: data.email, email_confirm: true }
      );
    }

    if (password && password.trim()) {
      if (targetUserId === user.id && !isAdmin) {
        if (!currentPassword) {
          return NextResponse.json({ error: messages.toast.contrasenaActualRequerida }, { status: 400 });
        }
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: currentPassword,
        });
        if (verifyError) {
          return NextResponse.json({ error: messages.toast.contrasenaActualIncorrecta }, { status: 400 });
        }
      }

      const { data: authUser, error: fetchError } = await serviceSupabase.auth.admin.getUserById(targetUserId);
      if (fetchError || !authUser?.user) {
        return NextResponse.json({ 
          error: messages.toast.cuentaAuthNoExiste,
          profile: data 
        }, { status: 400 });
      }

      const { error: pwError } = await serviceSupabase.auth.admin.updateUserById(
        targetUserId,
        { password: password }
      );
      if (pwError) {
        return NextResponse.json({ 
          error: messages.toast.errorCambiarContrasena,
          profile: data 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ profile: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
