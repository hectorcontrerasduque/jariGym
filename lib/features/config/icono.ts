import type { SupabaseClient } from "@supabase/supabase-js";

/** Favicon de respaldo cuando el gimnasio no tiene logo cargado. */
export const FALLBACK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#D42B2B"/><text x="50" y="65" text-anchor="middle" font-size="50" font-weight="bold" fill="white" font-family="Arial">G</text></svg>';

export interface IconoCargado {
  bytes: ArrayBuffer | string;
  contentType: string;
  /** true si se usó el favicon estático (no hay logo o falló la descarga). */
  esFallback: boolean;
}

/**
 * Logo del gimnasio como icono de la app (favicon / apple-icon / PWA).
 * Lee `gym_config.logo_url` (bucket `logos`, lectura pública) y descarga la
 * imagen; si no hay logo o falla, devuelve el favicon SVG estático.
 */
export async function cargarIconoGym(
  supabase: SupabaseClient,
  fetchImpl: typeof fetch = fetch
): Promise<IconoCargado> {
  try {
    const { data } = await supabase
      .from("gym_config")
      .select("logo_url")
      .limit(1)
      .maybeSingle();

    const url = typeof data?.logo_url === "string" ? data.logo_url.trim() : "";
    if (url) {
      const res = await fetchImpl(url, { cache: "no-store" });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "image/png";
        if (contentType.startsWith("image/")) {
          const bytes = await res.arrayBuffer();
          if (bytes.byteLength > 0) {
            return { bytes, contentType, esFallback: false };
          }
        }
      }
    }
  } catch {
    // Cualquier fallo → fallback estático.
  }

  return { bytes: FALLBACK_ICON_SVG, contentType: "image/svg+xml", esFallback: true };
}
