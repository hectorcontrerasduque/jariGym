import { normalizarTasa, type TasaBCV } from "../domain";

/** Proveedor de la tasa BCV y atribucion mostrada en la modal. */
export const FUENTE_TASA = {
  nombre: "DolarAPI Venezuela",
  datos: "BCV",
  url: "https://ve.dolarapi.com",
  endpoint: "https://ve.dolarapi.com/v1/dolares/oficial",
} as const;

const TIMEOUT_MS = 4000;

/**
 * Consulta la tasa oficial del BCV. Devuelve null ante cualquier fallo
 * (timeout, red, HTTP != 200, payload invalido): nunca lanza.
 */
export async function obtenerTasaBcv(): Promise<TasaBCV | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(FUENTE_TASA.endpoint, {
        signal: controller.signal,
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return null;
      return normalizarTasa(await res.json());
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
