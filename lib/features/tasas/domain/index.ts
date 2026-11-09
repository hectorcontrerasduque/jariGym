/** Tasa cruda normalizada desde el proveedor. */
export interface TasaBCV {
  /** Fecha y hora de vigencia en ISO 8601. */
  effectiveAt: string;
  /** Valor en bolivares por 1 USD. */
  rateBs: number;
}

/** Fila de public.exchange_rates. */
export interface TasaFila {
  id: number;
  effective_at: string;
  rate_bs: number;
  source?: string;
  created_at?: string;
}

/** Horas minimas entre intentos automaticos de actualizacion. */
export const HORAS_VIGENCIA = 6;

/** Cuantas filas se conservan como historial. */
export const LIMITE_TASAS = 10;

/**
 * Valida y normaliza la respuesta del proveedor ({ promedio, fechaActualizacion }).
 * Devuelve null si el payload no trae un monto > 0 o una fecha utilizable.
 */
export function normalizarTasa(payload: unknown): TasaBCV | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { promedio?: unknown; fechaActualizacion?: unknown };

  const bruto = typeof p.promedio === "number" ? p.promedio : Number(p.promedio);
  if (!Number.isFinite(bruto) || bruto <= 0) return null;

  const fecha = typeof p.fechaActualizacion === "string" ? p.fechaActualizacion : "";
  const ts = Date.parse(fecha);
  if (Number.isNaN(ts)) return null;

  return { effectiveAt: new Date(ts).toISOString(), rateBs: Math.round(bruto * 10000) / 10000 };
}

/**
 * true si no hay registro o el ultimo supera las HORAS_VIGENCIA respecto de `hoy`.
 * Recibe `hoy` en vez de llamar new Date() para que el dominio sea puro y testeable.
 */
export function necesitaActualizar(ultimaEffectiveAt: string | null | undefined, hoy: Date): boolean {
  if (!ultimaEffectiveAt) return true;
  const ts = Date.parse(ultimaEffectiveAt);
  if (Number.isNaN(ts)) return true;
  return hoy.getTime() - ts >= HORAS_VIGENCIA * 3600 * 1000;
}

function compararDesc(a: TasaFila, b: TasaFila): number {
  const porVigencia = Date.parse(b.effective_at) - Date.parse(a.effective_at);
  if (porVigencia !== 0) return porVigencia;
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  return cb - ca;
}

/**
 * Se queda con las `limite` mas recientes (vigencia desc, desempate por created_at desc).
 * No muta la entrada.
 */
export function recortarAUltimas(tasas: TasaFila[], limite: number = LIMITE_TASAS): TasaFila[] {
  return [...tasas].sort(compararDesc).slice(0, limite);
}
