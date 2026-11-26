import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(request: Request) {
  try {
    const limitada = await applyRateLimit(request, {
      max: 30,
      windowMs: 60 * 60 * 1000,
      prefix: "migracion",
    });
    if (limitada) return limitada;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("migracion")
      .select("nombre, migrado")
      .order("nombre", { ascending: true });

    if (error) {
      return NextResponse.json({ error: messages.migracion.error }, { status: 500 });
    }

    // Una entrada por nombre; si cualquier fila está migrada, el nombre queda como migrado.
    const nameMap = new Map<string, { nombre: string; migrado: string }>();
    for (const row of data || []) {
      const nombre = row.nombre?.toUpperCase();
      if (!nombre) continue;
      if (!nameMap.has(nombre)) {
        nameMap.set(nombre, { nombre, migrado: row.migrado });
      }
      const entry = nameMap.get(nombre)!;
      if (row.migrado === "si") {
        entry.migrado = "si";
      }
    }

    return NextResponse.json({ records: Array.from(nameMap.values()) });
  } catch {
    return NextResponse.json({ error: messages.migracion.errorServidor }, { status: 500 });
  }
}
