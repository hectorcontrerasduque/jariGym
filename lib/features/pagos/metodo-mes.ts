import type { SupabaseClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";

/**
 * Un mes (o inscripción) se completa con UN SOLO método de pago.
 *
 * Verifica, antes de crear un pago, que cada grupo (mes, año, tipo) no tenga
 * pagos previos con otro método. La lógica de cobertura prorated se mantiene;
 * esto solo evita que un mes iniciado en Bs se continúe en efectivo (o al revés).
 */

export interface DetalleMetodoInput {
  month_number: number | null;
  year_number: number | null;
  payment_type: string;
}

function etiquetaMetodo(metodo: string): string {
  if (metodo === "bs") return messages.metodoPago.bs;
  if (metodo === "binance") return messages.metodoPago.binance;
  return messages.metodoPago.efectivo;
}

interface FilaMetodo {
  month_number: number | null;
  year_number: number | null;
  payment_type: string;
  payments:
    | { user_id: string; payment_method: string | null }
    | Array<{ user_id: string; payment_method: string | null }>;
}

/**
 * Lanza si algún mes ya tiene pagos con un método distinto al indicado.
 * Fail-open ante error de lectura (no bloquea pagos por un fallo de red).
 */
export async function validarMetodoUnicoPorMes(
  supabase: SupabaseClient,
  userId: string,
  metodo: string,
  detalles: DetalleMetodoInput[]
): Promise<void> {
  const meses = detalles.filter(
    (d) => d.month_number !== null && d.year_number !== null
  );
  if (meses.length === 0) return;

  const anios = Array.from(new Set(meses.map((d) => d.year_number as number)));
  const { data, error } = await supabase
    .from("payment_detail")
    .select("month_number, year_number, payment_type, payments!inner(user_id, payment_method)")
    .eq("payments.user_id", userId)
    .in("year_number", anios);

  if (error || !data) return;

  const metodosPorGrupo = new Map<string, Set<string>>();
  for (const row of data as unknown as FilaMetodo[]) {
    const pago = Array.isArray(row.payments) ? row.payments[0] : row.payments;
    if (!pago) continue;
    const key = `${row.payment_type}|${row.month_number}|${row.year_number}`;
    const set = metodosPorGrupo.get(key) ?? new Set<string>();
    if (pago.payment_method) set.add(pago.payment_method);
    metodosPorGrupo.set(key, set);
  }

  for (const detalle of meses) {
    const key = `${detalle.payment_type}|${detalle.month_number}|${detalle.year_number}`;
    const metodos = metodosPorGrupo.get(key);
    if (!metodos || metodos.size === 0) continue;
    if (!metodos.has(metodo)) {
      const existente = Array.from(metodos)[0] ?? "efectivo";
      const plantilla =
        detalle.payment_type === "inscripcion"
          ? messages.bolivares.inscripcionOtroMetodo
          : messages.bolivares.mesOtroMetodo;
      throw new Error(plantilla.replace("{metodo}", etiquetaMetodo(existente)));
    }
  }
}
