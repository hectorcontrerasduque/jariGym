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

    const { email, nombre, username, password } = await request.json();

    if (!email || !nombre) {
      return NextResponse.json({ error: "Email y nombre requeridos" }, { status: 400 });
    }

    const isGmail = email.toLowerCase().endsWith("@gmail.com");

    if (!isGmail && (!username || !password)) {
      return NextResponse.json(
        { error: "Para correos no-Gmail, usuario y contraseña son requeridos" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const userPassword = isGmail
      ? Math.random().toString(36).slice(-12) + "A1!"
      : password;

    const userEmail = isGmail ? email : `${username}@gymapp.local`;

    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      password: userPassword,
      user_metadata: { nombre_completo: nombre, display_email: email },
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

    return NextResponse.json({ miembro: data, password: userPassword, loginEmail: userEmail });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
