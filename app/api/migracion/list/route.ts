import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(request: Request) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 100,
    windowMs: 60 * 60 * 1000,
    prefix: "migracion-list",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("migracion")
      .select("nombre, correo, migrado")
      .order("nombre", { ascending: true });

    if (error) {
      return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
    }

    // Deduplicate: one entry per unique nombre, with all associated emails
    const nameMap = new Map<string, { nombre: string; correos: string[]; migrado: string }>();
    for (const row of data || []) {
      const nombre = row.nombre?.toUpperCase();
      if (!nombre) continue;
      if (!nameMap.has(nombre)) {
        nameMap.set(nombre, { nombre, correos: [], migrado: row.migrado });
      }
      const entry = nameMap.get(nombre)!;
      if (row.correo && !entry.correos.includes(row.correo.toLowerCase())) {
        entry.correos.push(row.correo.toLowerCase());
      }
      // If any record for this name is migrated, mark as migrated
      if (row.migrado === "si") {
        entry.migrado = "si";
      }
    }

    return NextResponse.json({ records: Array.from(nameMap.values()) });
  } catch {
    return NextResponse.json({ error: messages.migracion.errorServidor }, { status: 500 });
  }
}
