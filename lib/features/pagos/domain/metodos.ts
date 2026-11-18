import type { MetodoPago, PaymentMethod } from "@/lib/types";

/** Orden canónico de presentación y desempate entre métodos. */
export const ORDEN_METODOS: MetodoPago[] = ["efectivo", "bs", "binance"];

function ordenMetodo(metodo: MetodoPago): number {
  const i = ORDEN_METODOS.indexOf(metodo);
  return i === -1 ? ORDEN_METODOS.length : i;
}

function tiempo(iso: string | null | undefined): number {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Una fila vigente por método: la de mayor `created_at` (el versionado de
 * `gym_config_payment_methods` inserta una fila nueva en cada guardado).
 * Empate: gana la activa; si persiste, la que ya estaba. Orden canónico.
 */
export function dedupeMetodos(filas: PaymentMethod[] | null | undefined): PaymentMethod[] {
  const vigentes = new Map<MetodoPago, PaymentMethod>();
  for (const fila of filas || []) {
    if (!fila?.payment_method) continue;
    const actual = vigentes.get(fila.payment_method);
    if (!actual) {
      vigentes.set(fila.payment_method, fila);
      continue;
    }
    const tFila = tiempo(fila.created_at);
    const tActual = tiempo(actual.created_at);
    if (tFila > tActual || (tFila === tActual && fila.is_active && !actual.is_active)) {
      vigentes.set(fila.payment_method, fila);
    }
  }
  return Array.from(vigentes.values()).sort(
    (a, b) => ordenMetodo(a.payment_method) - ordenMetodo(b.payment_method)
  );
}

/** Filas vigentes de los métodos habilitados, en orden canónico. */
export function metodosActivos(filas: PaymentMethod[] | null | undefined): PaymentMethod[] {
  return dedupeMetodos(filas).filter((m) => m.is_active);
}

/**
 * Primera activación histórica de cada método: el `created_at` mínimo de sus
 * filas. Solo se insertan filas al activar, así que el mínimo histórico es el
 * momento en que el método se habilitó por primera vez.
 */
export function primeraActivacionPorMetodo(
  filas: PaymentMethod[] | null | undefined
): Map<MetodoPago, number> {
  const primera = new Map<MetodoPago, number>();
  for (const fila of filas || []) {
    if (!fila?.payment_method) continue;
    const t = tiempo(fila.created_at);
    if (t === 0) continue;
    const previa = primera.get(fila.payment_method);
    if (previa === undefined || t < previa) primera.set(fila.payment_method, t);
  }
  return primera;
}

/**
 * Método preseleccionado en Mis Pagos.
 * 1. La elección guardada en Config, si sigue habilitada.
 * 2. El método activo con la primera activación más antigua.
 * 3. Desempate: orden canónico efectivo > bs > binance.
 * null si no hay métodos activos.
 */
export function metodoPorDefecto(
  filas: PaymentMethod[] | null | undefined,
  guardado: MetodoPago | null | undefined
): MetodoPago | null {
  const activos = metodosActivos(filas);
  if (activos.length === 0) return null;
  if (guardado && activos.some((m) => m.payment_method === guardado)) return guardado;

  const primera = primeraActivacionPorMetodo(filas);
  let mejor = activos[0];
  for (const actual of activos) {
    const tActual = primera.get(actual.payment_method) ?? Number.POSITIVE_INFINITY;
    const tMejor = primera.get(mejor.payment_method) ?? Number.POSITIVE_INFINITY;
    if (
      tActual < tMejor ||
      (tActual === tMejor && ordenMetodo(actual.payment_method) < ordenMetodo(mejor.payment_method))
    ) {
      mejor = actual;
    }
  }
  return mejor.payment_method;
}
