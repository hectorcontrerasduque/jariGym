import type { MesPendiente } from "./types";

/**
 * Spec: "Meses pendientes de un miembro".
 * Always returns up to 12 consecutive months without approved/pending payments.
 * Extends into the next year if needed to reach 12 months.
 * @param detalles detail lines of the member's approved/pending payments (any year)
 */
export function calcularMesesPendientes(
  detalles: Array<{ month_number: number | null; year_number: number | null }>,
  anio: number,
  startDate?: string
): MesPendiente[] {
  const mesesConPago = new Set<string>();
  for (const d of detalles) {
    if (d.year_number && d.month_number) {
      mesesConPago.add(`${d.month_number}-${d.year_number}`);
    }
  }

  let primerMesDeuda = 1;
  const primerAnioDeuda = anio;
  if (startDate) {
    const parts = startDate.split("-").map(Number);
    const anioInicio = parts[0];
    const mesInicio = parts[1];
    if (anioInicio > anio) return [];
    if (anioInicio === anio) primerMesDeuda = mesInicio;
  }

  const mesesPendientes: MesPendiente[] = [];
  const objetivo = 12;
  let year = primerAnioDeuda;
  let mes = primerMesDeuda;

  while (mesesPendientes.length < objetivo) {
    if (!mesesConPago.has(`${mes}-${year}`)) {
      mesesPendientes.push({ month_number: mes, year_number: year });
    }
    mes++;
    if (mes > 12) {
      mes = 1;
      year++;
    }
  }

  return mesesPendientes;
}
