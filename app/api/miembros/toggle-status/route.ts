import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";

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

    const body = await request.json();
    const { user_id, activar } = body;

    if (!user_id || typeof activar !== "boolean") {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Actualizar profiles.activo
    const { data: profileData, error: profileError } = await serviceSupabase
      .from("profiles")
      .update({ activo: activar })
      .eq("id", user_id)
      .select()
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    // 2. Actualizar auth.users: ban/unban
    if (activar) {
      // Desbanear usuario
      await serviceSupabase.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
    } else {
      // Banear usuario (100 años = aproximadamente siempre)
      await serviceSupabase.auth.admin.updateUserById(user_id, {
        ban_duration: "52560000",
      });
    }

    return NextResponse.json({ profile: profileData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
