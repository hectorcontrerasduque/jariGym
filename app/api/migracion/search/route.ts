import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { sanitizeOrFilter } from "@/lib/utils/sanitize";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

export async function POST(request: Request) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 30,
    windowMs: 60 * 60 * 1000,
    prefix: "api",
  });
  if (rateLimitResponse) return rateLimitResponse;
  
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

    // SECURITY: Sanitize input for PostgREST .or() to prevent injection
    const orFilter = sanitizeOrFilter(words);

    const { data, error } = await supabase
      .from("migracion")
      .select("nombre")
      .or(orFilter)
      .eq("migrado", "no")
      .limit(10);

    if (error) {
      return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
    }

    if (!data || data.length === 0) {
      // Check if records exist but are already migrated
      const { data: migratedData } = await supabase
        .from("migracion")
        .select("nombre", { count: "exact", head: true })
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
