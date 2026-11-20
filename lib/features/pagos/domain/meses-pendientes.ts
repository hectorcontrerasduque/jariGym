import type { MesConCobertura } from "./types";
import {
  calcularCoberturaGrupos,
  type FilaCobertura,
  type PreciosPorMetodo,
} from "./cobertura";

/**
 * Spec: "Meses pendientes de un miembro".
 * Devuelve hasta 12 meses consecutivos que NO están cubiertos por monto.
 *
 * - Un mes está cubierto si la fracción pagada (pagos aprobados / precio
 *   congelado del método) llega a 1, o si tiene una suspensión.
 * - Un mes con pagos `pendiente` queda bloqueado (no aparece) para evitar
 *   doble cobro mientras el super-admin revisa.
 * - La inscripción no cubre meses de mensualidad (se agrupa por tipo).
 *
 * @param detalles filas de payment_detail con su cabecera (aprobado/pendiente)
 * @param anio año base del selector
 * @param startDate fecha de inicio de membresía (primer mes de deuda)
 * @param precios precios actuales por método/tipo (fallback sin snapshot)
 */
export function calcularMesesPendientes(
  detalles: FilaCobertura[],
  anio: number,
  startDate?: string,
  precios: PreciosPorMetodo = {}
): MesConCobertura[] {
  const grupos = calcularCoberturaGrupos(detalles, precios);
  const mensualidad = new Map<string, (typeof grupos)[number]>();
  const suspendidos = new Set<string>();

  for (const grupo of grupos) {
    const key = `${grupo.month_number}-${grupo.year_number}`;
    if (grupo.payment_type === "suspension") suspendidos.add(key);
    else if (grupo.payment_type === "mensualidad") mensualidad.set(key, grupo);
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

  const mesesPendientes: MesConCobertura[] = [];
  const objetivo = 12;
  let year = primerAnioDeuda;
  let mes = primerMesDeuda;

  while (mesesPendientes.length < objetivo) {
    const key = `${mes}-${year}`;
    const grupo = mensualidad.get(key);
    const cubierto =
      suspendidos.has(key) || (grupo !== undefined && grupo.fraccionPagada >= 1 - 1e-9);
    const bloqueado = grupo?.tienePendiente ?? false;

    if (!cubierto && !bloqueado) {
      const fraccion = grupo?.fraccionPagada ?? 0;
      mesesPendientes.push({
        month_number: mes,
        year_number: year,
        fraccionPagada: fraccion,
        fraccionPendiente: Math.max(0, 1 - fraccion),
        porcentaje: Math.min(100, Math.round(fraccion * 100)),
        montoPagado: grupo?.montoPagado ?? 0,
        preciosPorMetodo: grupo?.preciosPorMetodo ?? {},
      });
    }

    mes++;
    if (mes > 12) {
      mes = 1;
      year++;
    }
  }

  return mesesPendientes;
}
