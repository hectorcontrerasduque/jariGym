/* eslint-disable security/detect-object-injection -- claves controladas (métodos de pago) */
import type { MesConCobertura } from "./types";

/**
 * Cobertura de meses por monto (pagos parciales), sin Supabase.
 *
 * Modelo PRORATED: cada pago compra la fracción del mes que le corresponde
 * según el precio de SU método de pago. `expected_amount_usd` guarda el precio
 * del método congelado al momento del pago (snapshot). Para cada
 * (mes, año, tipo, método) se usa el precio de la fila más antigua (precio
 * contratado); así un cambio de tarifa no es retroactivo.
 *
 * Reglas:
 * - Solo las cabeceras "aprobado" cuentan para la fracción.
 * - Una cabecera "pendiente" marca el mes como `tienePendiente` (bloqueado para
 *   evitar doble cobro mientras el super-admin revisa).
 * - `suspension` cubre el mes completo (monto 0, sin importar el estado).
 */

/** Fila de payment_detail con los datos necesarios para calcular cobertura. */
export interface FilaCobertura {
  month_number: number | null;
  year_number: number | null;
  payment_type: string;
  payment_amount: number;
  expected_amount_usd: number | null;
  status: string;
  payment_method: string | null;
  created_at: string;
}

/** Precio actual por método y tipo (fallback cuando no hay snapshot). */
export type PreciosPorMetodo = Record<string, { mensual: number; inscripcion: number }>;

export interface CoberturaGrupo {
  month_number: number;
  year_number: number;
  payment_type: string;
  fraccionPagada: number;
  montoPagado: number;
  tienePendiente: boolean;
  preciosPorMetodo: Record<string, number>;
}

function tiempo(iso: string | null | undefined): number {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : 0;
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Precio de referencia para un método/tipo (fallback efectivo → 0). */
export function precioMetodo(
  precios: PreciosPorMetodo,
  metodo: string,
  tipo: string
): number {
  const campo = tipo === "inscripcion" ? "inscripcion" : "mensual";
  const propio = precios[metodo]?.[campo];
  if (propio !== undefined && propio !== null) return Number(propio);
  const efectivo = precios.efectivo?.[campo];
  return valorSeguro(efectivo);
}

function valorSeguro(valor: number | undefined): number {
  return valor === undefined || valor === null ? 0 : Number(valor);
}

/** Precio congelado por método: el `expected` de la fila más antigua de ese método. */
function precioCongelado(
  filas: FilaCobertura[],
  tipo: string,
  precios: PreciosPorMetodo
): Record<string, number> {
  const congelados: Record<string, number> = {};
  const ordenadas = [...filas].sort((a, b) => tiempo(a.created_at) - tiempo(b.created_at));
  for (const fila of ordenadas) {
    const metodo = fila.payment_method || "efectivo";
    if (congelados[metodo] !== undefined) continue;
    const esperado = fila.expected_amount_usd;
    congelados[metodo] = esperado !== null && Number(esperado) > 0
      ? Number(esperado)
      : precioMetodo(precios, metodo, tipo);
  }
  // Métodos sin filas: precio actual de config (se congelará al primer pago).
  for (const metodo of Object.keys(precios)) {
    if (congelados[metodo] === undefined) {
      congelados[metodo] = precioMetodo(precios, metodo, tipo);
    }
  }
  return congelados;
}

/** Calcula la cobertura de todos los grupos (mes, año, tipo) presentes. */
export function calcularCoberturaGrupos(
  detalles: FilaCobertura[],
  precios: PreciosPorMetodo = {}
): CoberturaGrupo[] {
  const grupos = new Map<string, FilaCobertura[]>();
  for (const fila of detalles) {
    if (fila.month_number === null || fila.year_number === null || !fila.payment_type) continue;
    const key = `${fila.payment_type}|${fila.month_number}|${fila.year_number}`;
    const lista = grupos.get(key);
    if (lista) lista.push(fila);
    else grupos.set(key, [fila]);
  }

  const resultado: CoberturaGrupo[] = [];
  for (const filas of grupos.values()) {
    const primera = filas[0];
    const tipo = primera.payment_type;
    const preciosPorMetodo = precioCongelado(filas, tipo, precios);

    let fraccion = 0;
    let montoPagado = 0;
    let tienePendiente = false;

    for (const fila of filas) {
      if (tipo === "suspension") break;
      if (fila.status === "pendiente") tienePendiente = true;
      if (fila.status !== "aprobado") continue;

      const metodo = fila.payment_method || "efectivo";
      const precio = preciosPorMetodo[metodo] ?? precioMetodo(precios, metodo, tipo);
      const pagado = Number(fila.payment_amount || 0);
      montoPagado += pagado;
      if (precio > 0) fraccion += pagado / precio;
      else if (pagado > 0) fraccion += 1; // precio 0/desconocido: cuenta como cubierto
    }

    // La suspensión cubre el mes completo (monto 0).
    if (tipo === "suspension") {
      fraccion = 1;
      tienePendiente = false;
    }

    resultado.push({
      month_number: primera.month_number as number,
      year_number: primera.year_number as number,
      payment_type: tipo,
      fraccionPagada: redondear2(fraccion),
      montoPagado: redondear2(montoPagado),
      tienePendiente,
      preciosPorMetodo,
    });
  }

  return resultado;
}

/** Convierte filas de la query en el formato del dominio (tolerante a tipos). */
export function filasCoberturaDesdeQuery(
  rows: Array<{
    month_number: number | null;
    year_number: number | null;
    payment_type: string;
    payment_amount: number | string | null;
    expected_amount_usd: number | string | null;
    payments:
      | { status: string; payment_method: string | null; created_at: string }
      | Array<{ status: string; payment_method: string | null; created_at: string }>;
  }>
): FilaCobertura[] {
  return rows.map((row) => {
    const pago = Array.isArray(row.payments) ? row.payments[0] : row.payments;
    return {
      month_number: row.month_number,
      year_number: row.year_number,
      payment_type: row.payment_type,
      payment_amount: Number(row.payment_amount ?? 0),
      expected_amount_usd:
        row.expected_amount_usd === null ? null : Number(row.expected_amount_usd),
      status: pago?.status ?? "",
      payment_method: pago?.payment_method ?? null,
      created_at: pago?.created_at ?? "",
    };
  });
}

/** Precios por método a partir de las filas activas de config. */
export function preciosDesdeMetodos(
  metodos: Array<{
    payment_method: string;
    amount_monthly: number | string | null;
    amount_inscription: number | string | null;
  }>
): PreciosPorMetodo {
  return Object.fromEntries(
    metodos.map((m) => [
      m.payment_method,
      {
        mensual: Number(m.amount_monthly ?? 0),
        inscripcion: Number(m.amount_inscription ?? 0),
      },
    ])
  );
}

/** USD necesarios para completar un mes al precio del método indicado. */
export function pendienteUsd(
  mes: MesConCobertura,
  metodo: string,
  precioActual: number
): number {
  const precio = mes.preciosPorMetodo[metodo] ?? precioActual;
  if (!(precio > 0)) return 0;
  return redondear2(Math.max(0, mes.fraccionPendiente) * precio);
}

/**
 * Distribución secuencial: llena cada necesidad en orden (mes más viejo
 * primero) con el total disponible. El sobrante se devuelve como `excedente`.
 */
export function distribuirSecuencial(
  totalUsd: number,
  necesidades: number[]
): { aplicados: number[]; excedente: number } {
  let restante = Math.max(0, Math.round(totalUsd * 100));
  const aplicados = necesidades.map((necesidad) => {
    if (restante <= 0) return 0;
    const centavos = Math.max(0, Math.round(necesidad * 100));
    const aplicar = Math.min(centavos, restante);
    restante -= aplicar;
    return Math.round(aplicar) / 100;
  });
  return { aplicados, excedente: Math.round(restante) / 100 };
}
