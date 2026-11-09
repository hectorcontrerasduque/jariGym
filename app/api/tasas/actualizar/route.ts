import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { TasasService } from "@/lib/features/tasas/service";
import { FUENTE_TASA } from "@/lib/features/tasas/proveedores/dolarapi";

/**
 * Refresca la tasa BCV desde el proveedor (cualquier rol autenticado).
 * `forzar: true` consulta aunque la vigente esté fresca (botón "Actualizar");
 * sin forzar solo consulta si la última vigencia supera las 6 h (o no hay registro).
 * Fail-open: si el proveedor falla responde 200 con `actualizado: false` + `error`.
 * Límite: 10 cada hora por usuario.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const limitada = await applyRateLimit(
      request,
      { max: 10, windowMs: 60 * 60 * 1000, prefix: "tasas" },
      user.id
    );
    if (limitada) return limitada;

    const body = (await request.json().catch(() => null)) as { forzar?: unknown } | null;
    const forzar = body?.forzar === true;

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const service = new TasasService(serviceSupabase);
    const resultado = await service.actualizar({ forzar });

    return NextResponse.json({ ...resultado, fuente: FUENTE_TASA });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
