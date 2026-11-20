import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Suma de los detalles de inscripción de pagos aprobados de un usuario.
 * Es la fuente de verdad de `profiles.inscription_amount_paid`.
 */
export async function calcularMontoInscripcionAprobado(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("payment_detail")
    .select("payment_amount, payments!inner(status, user_id)")
    .eq("payment_type", "inscripcion")
    .eq("payments.status", "aprobado")
    .eq("payments.user_id", userId);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ payment_amount: number | string | null }>;
  return rows.reduce((total, row) => total + Number(row.payment_amount ?? 0), 0);
}

/**
 * Precio de inscripción configurado (USD) para el método indicado.
 * Fallback al efectivo y luego a cualquier método activo.
 */
export async function precioInscripcionActual(
  supabase: SupabaseClient,
  metodo: string = "efectivo"
): Promise<number> {
  const { data } = await supabase
    .from("gym_config_payment_methods")
    .select("payment_method, amount_inscription")
    .eq("is_active", true);
  const rows = (data ?? []) as Array<{ payment_method: string; amount_inscription: number | string | null }>;
  const fila = rows.find((r) => r.payment_method === metodo) ?? rows.find((r) => r.payment_method === "efectivo") ?? rows[0];
  return Number(fila?.amount_inscription ?? 0);
}
