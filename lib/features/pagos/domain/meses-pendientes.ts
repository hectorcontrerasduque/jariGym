import type { MesPendiente } from "./types";

/**
 * Spec: "Meses pendientes de un miembro".
 * @param detalles detail lines of the member's approved/pending payments (any year)
 */
export function calcularMesesPendientes(
  detalles: Array<{ month_number: number | null; year_number: number | null }>,
  anio: number,
  startDate?: string
): MesPendiente[] {
  const mesesConPago = new Set<string>();
  for (const d of detalles) {
    if (d.year_number === anio && d.month_number) {
      mesesConPago.add(`${d.month_number}-${d.year_number}`);
    }
  }

  let primerMesDeuda = 1;
  if (startDate) {
    const parts = startDate.split("-").map(Number);
    const anioInicio = parts[0];
    const mesInicio = parts[1];
    if (anioInicio > anio) return [];
    if (anioInicio === anio) primerMesDeuda = mesInicio;
  }

  const mesesPendientes: MesPendiente[] = [];
  for (let mes = 12; mes >= primerMesDeuda; mes--) {
    if (!mesesConPago.has(`${mes}-${anio}`)) {
      mesesPendientes.push({ month_number: mes, year_number: anio });
    }
  }

  return mesesPendientes.reverse();
}
