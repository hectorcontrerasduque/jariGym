import { createClient } from "@supabase/supabase-js";
import { cargarIconoGym } from "@/lib/features/config/icono";

export const dynamic = "force-dynamic";

/** Icono de pantalla de inicio (iOS) = logo del gimnasio. */
export default async function AppleIcon() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const icono = await cargarIconoGym(supabase);

  // Sin logo: usar el PNG estático (Apple no admite SVG para touch icons).
  if (icono.esFallback) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/icons/apple-touch-icon.png" },
    });
  }

  return new Response(icono.bytes, {
    headers: {
      "Content-Type": icono.contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
