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
