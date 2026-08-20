import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

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

    const orFilter = words.map((w) => `nombre.ilike.%${w}%`).join(",");

    const { data, error } = await supabase
      .from("migracion")
      .select("nombre")
      .or(orFilter)
      .eq("migrado", "no");

    if (error) {
      return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
    }

    const uniqueNames = Array.from(new Set((data || []).map((r) => r.nombre.toUpperCase()))).sort();

    return NextResponse.json({ matches: uniqueNames });
  } catch {
    return NextResponse.json({ error: messages.toast.errorGenerico }, { status: 500 });
  }
}
