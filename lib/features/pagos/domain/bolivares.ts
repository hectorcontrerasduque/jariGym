/**
 * Dominio puro del pago en bolívares (payment_bolivares).
 * Funciones sin Supabase — se unit-testean con datos literales.
 *
 * Reglas del negocio:
 * - amount_usd = amount_bs / rate_bcv (redondeado a 2 decimales).
 * - payment_detail.payment_amount para pagos BS siempre = amount_usd del detalle.
 * - Un mes (o inscripción) queda "cubierto" cuando la SUMA de amount_usd de los
 *   payment_bolivares RECONCILIADOS de ese (mes, año, tipo) es >= el monto
 *   mensual configurado para ese tipo de pago.
 * - reconciled=true NO implica payment aprobado: el payment solo pasa a
 *   "aprobado" cuando TODOS sus detalles están cubiertos.
 */

export interface DetalleInput {
  month_number: number | null;
  year_number: number | null;
  payment_type: "mensualidad" | "inscripcion" | "suspension";
  /** Monto esperado en USD (config) — solo sirve de peso para repartir. */
  payment_amount: number;
}

export interface RepartoDetalle {
  month_number: number | null;
  year_number: number | null;
  payment_type: "mensualidad" | "inscripcion" | "suspension";
  /** USD efectivamente pagado en este detalle (= payment_detail.payment_amount). */
  amount_usd: number;
  /** Bs de este detalle (amount_usd * rate, ajustado para que sume el total). */
  amount_bs: number;
}

/** Convierte Bs → USD con la tasa dada (2 decimales). */
export function convertirBsABsd(amountBs: number, rateBcv: number): number {
  if (!(rateBcv > 0)) throw new Error("rate_bcv debe ser > 0");
  if (!(amountBs > 0)) throw new Error("amount_bs debe ser > 0");
  return Math.round((amountBs / rateBcv) * 100) / 100;
}

/**
 * Reparte un total en USD entre los detalles proporcionally a su monto esperado
 * (config). Si todos los esperados son 0, reparte en partes iguales.
 * El residuo de redondeo va al último detalle para que la suma sea exacta.
 */
export function repartirUsdEntreDetalles(
  totalUsd: number,
  detalles: DetalleInput[],
  rateBcv: number
): RepartoDetalle[] {
  if (detalles.length === 0) throw new Error("No hay detalles para repartir");
  if (!(totalUsd > 0)) throw new Error("totalUsd debe ser > 0");
  if (!(rateBcv > 0)) throw new Error("rate_bcv debe ser > 0");

  const pesos = detalles.map((d) => Math.max(d.payment_amount, 0));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const pesosFinales = sumaPesos > 0 ? pesos : detalles.map(() => 1);
  const sumaPesosFinales = sumaPesos > 0 ? sumaPesos : detalles.length;

  const totalCents = Math.round(totalUsd * 100);
  let restanteCents = totalCents;

  return detalles.map((d, i) => {
    const esUltimo = i === detalles.length - 1;
    // eslint-disable-next-line security/detect-object-injection -- índice numérico de array controlado
    const peso = pesosFinales[i] ?? 0;
    const cents = esUltimo
      ? restanteCents
      : Math.round((totalCents * peso) / sumaPesosFinales);
    restanteCents -= cents;
    const amountUsd = cents / 100;
    // amount_bs proporcional al USD de este detalle (suma exacta del total en Bs).
    const amountBs = Math.round(amountUsd * rateBcv * 100) / 100;
    return {
      month_number: d.month_number,
      year_number: d.year_number,
      payment_type: d.payment_type,
      amount_usd: amountUsd,
      amount_bs: amountBs,
    };
  });
}

export interface CubiertoInput {
  /** Monto esperado en USD para el tipo (gym_config_payment_methods.amount_*). */
  montoEsperadoUsd: number;
  /** Suma de amount_usd de bolivares reconciliados para (mes, año, tipo). */
  sumaReconciliadaUsd: number;
}

/** Un (mes, año, tipo) queda cubierto si la suma reconciliada >= monto esperado. */
export function estaCubierto({ montoEsperadoUsd, sumaReconciliadaUsd }: CubiertoInput): boolean {
  if (montoEsperadoUsd <= 0) return true; // monto 0 (p.ej. suspensión) siempre cubierto
  return sumaReconciliadaUsd + 1e-9 >= montoEsperadoUsd;
}

export interface DetalleCobertura {
  month_number: number | null;
  year_number: number | null;
  payment_type: "mensualidad" | "inscripcion" | "suspension";
  /** Monto esperado en USD del tipo. */
  montoEsperadoUsd: number;
  /** Suma reconciliada hasta ahora para ese (mes, año, tipo). */
  sumaReconciliadaUsd: number;
}

/**
 * ¿Está el payment listo para aprobarse? Solo si TODOS sus detalles están cubiertos.
 * (reconciled=true de sus bolivares es condición necesaria pero no suficiente.)
 */
export function paymentListoParaAprobar(detalles: DetalleCobertura[]): boolean {
  if (detalles.length === 0) return false;
  return detalles.every((d) =>
    estaCubierto({ montoEsperadoUsd: d.montoEsperadoUsd, sumaReconciliadaUsd: d.sumaReconciliadaUsd })
  );
}

/** Restante en USD para cubrir un detalle (0 si ya cubierto). */
export function restanteUsd({ montoEsperadoUsd, sumaReconciliadaUsd }: CubiertoInput): number {
  const restante = montoEsperadoUsd - sumaReconciliadaUsd;
  return restante > 0 ? Math.round(restante * 100) / 100 : 0;
}
