import { createClient } from "@supabase/supabase-js";
import { cargarIconoGym } from "@/lib/features/config/icono";

// El logo puede cambiar desde Config: no prerenderizar en build.
export const dynamic = "force-dynamic";

/** Favicon de la app = logo del gimnasio (fallback: favicon estático). */
export default async function Icon() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const icono = await cargarIconoGym(supabase);

  return new Response(icono.bytes, {
    headers: {
      "Content-Type": icono.contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
