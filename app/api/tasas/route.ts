import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import { TasasService } from "@/lib/features/tasas/service";
import { FUENTE_TASA } from "@/lib/features/tasas/proveedores/dolarapi";

/** Últimos registros de tasa BCV (máx. 10) + atribución de la fuente. */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const service = new TasasService(supabase);
    const tasas = await service.obtenerTasas();

    return NextResponse.json({ tasas, fuente: FUENTE_TASA });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
