import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { nombreCompleto } = await request.json();
    if (!nombreCompleto || typeof nombreCompleto !== "string") {
      return NextResponse.json({ error: messages.migracion.error }, { status: 400 });
    }

    const nombre = nombreCompleto.trim().toUpperCase();
    if (nombre.length < 2) {
      return NextResponse.json({ matches: [] });
    }

    const words = nombre.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    const conditions: string[] = [];
    for (const w of words) {
      conditions.push(`nombre.ilike.%${w}%`);
      if (w.length > 3) {
        conditions.push(`nombre.ilike.%${w.slice(0, -1)}%`);
      }
    }
    const orFilter = conditions.join(",");

    const { data, error } = await supabase
      .from("migracion")
      .select("nombre")
      .or(orFilter)
      .eq("migrado", "no");

    if (error) {
      return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
    }

    if (!data || data.length === 0) {
      // Check if records exist but are already migrated
      const { data: migratedData } = await supabase
        .from("migracion")
        .select("nombre")
        .or(orFilter)
        .eq("migrado", "si")
        .limit(1);

      if (migratedData && migratedData.length > 0) {
        return NextResponse.json({ error: messages.migracion.yaMigrado }, { status: 400 });
      }

      return NextResponse.json({ matches: [] });
    }

    const uniqueNames = Array.from(new Set((data || []).map((r) => r.nombre.toUpperCase()))).sort();

    return NextResponse.json({ matches: uniqueNames });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
