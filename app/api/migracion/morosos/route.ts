import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const anio = Number(request.nextUrl.searchParams.get("anio")) || new Date().getFullYear();

    const { data: configResult } = await supabase
      .from("gym_config_payment_methods")
      .select("amount_monthly")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const montoMensual = configResult?.amount_monthly || 0;

    const { data: rows } = await supabase
      .from("migracion")
      .select("nombre, correo, mes_pagar, anio_pagar, estado")
      .eq("migrado", "no");

    if (!rows || rows.length === 0) {
      return NextResponse.json({ morosos: [] });
    }

    const porNombre = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.nombre?.trim().replace(/\s+/g, " ").toUpperCase();
      if (!key) continue;
      const arr = porNombre.get(key) || [];
      arr.push(row);
      porNombre.set(key, arr);
    }

    const morosos: Array<{
      id: string;
      email: string;
      full_name: string;
      mesesDeuda: number[];
      totalDeuda: number;
      debeInscripcion: boolean;
      pagosPendientes: number;
      montoPendiente: number;
      esMigrado: boolean;
    }> = [];

    for (const [nombre, filas] of porNombre) {
      const mesesDeuda = filas
        .filter((f) => f.estado === "debe" && f.anio_pagar === anio)
        .map((f) => f.mes_pagar)
        .sort((a, b) => a - b);

      if (mesesDeuda.length < 3) continue;

      morosos.push({
        id: `migracion-${nombre}`,
        email: filas.find((f) => f.correo)?.correo || "",
        full_name: nombre,
        mesesDeuda,
        totalDeuda: mesesDeuda.length * montoMensual,
        debeInscripcion: false,
        pagosPendientes: 0,
        montoPendiente: 0,
        esMigrado: true,
      });
    }

    return NextResponse.json({ morosos });
  } catch {
    return NextResponse.json({ error: "Error al obtener morosos migrados" }, { status: 500 });
  }
}
