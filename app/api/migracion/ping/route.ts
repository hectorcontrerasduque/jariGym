import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email || typeof email !== "string") {
      return NextResponse.json({ exists: false });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ exists: false, invalid: true });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data } = await supabase
      .from("profiles")
      .select("id, nombre_completo")
      .eq("email", normalizedEmail)
      .maybeSingle();

    const { data: migrated } = await supabase
      .from("migracion")
      .select("id")
      .eq("correo", normalizedEmail)
      .eq("migrado", "si")
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      exists: !!data,
      alreadyMigrated: !!migrated,
      nombre: data?.nombre_completo || null,
    });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
