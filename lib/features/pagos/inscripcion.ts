import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularCoberturaTipo,
  filasCoberturaDesdeQuery,
  preciosDesdeMetodos,
} from "./domain/cobertura";

export interface EstadoInscripcion {
  cubierta: boolean;
  montoPagado: number;
}

/**
 * Recalcula y persiste `profiles.inscription_paid` según la cobertura real de
 * los pagos de inscripción **aprobados** (regla prorated con precio congelado).
 *
 * `profiles.inscription_paid` es la ÚNICA fuente para mostrar/ocultar el
 * checkbox de inscripción. Debe llamarse cada vez que un pago con inscripción
 * queda aprobado, se rechaza o se elimina.
 */
export async function recalcularInscripcion(
  supabase: SupabaseClient,
  userId: string
): Promise<EstadoInscripcion> {
  const [{ data: filas }, { data: metodos }] = await Promise.all([
    supabase
      .from("payment_detail")
      .select(
        "month_number, year_number, payment_type, payment_amount, expected_amount_usd, payments!inner(status, user_id, payment_method, created_at)"
      )
      .eq("payment_type", "inscripcion")
      .eq("payments.user_id", userId)
      .in("payments.status", ["aprobado", "pendiente"]),
    supabase
      .from("gym_config_payment_methods")
      .select("payment_method, amount_monthly, amount_inscription")
      .eq("is_active", true),
  ]);

  const precios = preciosDesdeMetodos(metodos ?? []);
  const filasCobertura = filasCoberturaDesdeQuery(
    (filas ?? []) as unknown as Parameters<typeof filasCoberturaDesdeQuery>[0]
  );
  const cobertura = calcularCoberturaTipo(filasCobertura, "inscripcion", precios);

  const cubierta = cobertura !== null && cobertura.fraccionPagada >= 1 - 1e-9;
  const montoPagado = cobertura?.montoPagado ?? 0;

  await supabase
    .from("profiles")
    .update({
      inscription_paid: cubierta,
      inscription_amount_paid: montoPagado,
      inscription_date: cubierta ? new Date().toISOString().split("T")[0] : null,
    })
    .eq("id", userId);

  return { cubierta, montoPagado };
}
