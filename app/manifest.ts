import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Manifest PWA: nombre e iconos salen de la config (logo del gimnasio). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let nombre = "GymApp";
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("gym_config")
      .select("gym_name")
      .limit(1)
      .maybeSingle();
    if (typeof data?.gym_name === "string" && data.gym_name.trim()) {
      nombre = data.gym_name.trim();
    }
  } catch {
    // Config no disponible: nombre por defecto.
  }

  return {
    name: nombre,
    short_name: nombre.length > 12 ? nombre.slice(0, 12) : nombre,
    description: "Gestión de gimnasio: pagos, miembros y notificaciones.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B1120",
    theme_color: "#38BDF8",
    lang: "es",
    icons: [
      { src: "/icon", sizes: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180" },
    ],
  };
}
