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

    const { email, nombre } = await request.json();

    if (!email || !nombre) {
      return NextResponse.json({ error: "Email y nombre requeridos" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const password = Math.random().toString(36).slice(-12) + "A1!";

    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { nombre_completo: nombre },
    });

    if (authError) {
      console.error("Auth error:", authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { data, error: profileError } = await serviceSupabase
      .from("profiles")
      .upsert(
        {
          id: authUser.user.id,
          email,
          nombre_completo: nombre,
          role: "miembro",
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ miembro: data, password });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
