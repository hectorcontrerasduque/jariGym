/* eslint-disable security/detect-object-injection -- claves controladas (métodos de pago) */
import type { DeudaMetodo, EstadoCobertura, PagoRPCRow, PreciosPorMetodo } from "./types";

export type { DeudaMetodo, PreciosPorMetodo };

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
  user_id?: string;
  month_number: number | null;
  year_number: number | null;
  payment_type: string;
  payment_amount: number;
  expected_amount_usd: number | null;
  status: string;
  payment_method: string | null;
  created_at: string;
}

export interface CoberturaGrupo extends EstadoCobertura {
  month_number: number;
  year_number: number;
  payment_type: string;
  /** Hay pagos pendientes (bloquea el mes mientras se revisan). */
  tienePendiente: boolean;
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
    if (!fila.payment_type) continue;
    // La inscripción es un concepto global: puede no traer mes/año.
    if (fila.month_number === null && fila.payment_type !== "inscripcion") continue;
    const key = `${fila.payment_type}|${fila.month_number ?? ""}|${fila.year_number ?? ""}`;
    const lista = grupos.get(key);
    if (lista) lista.push(fila);
    else grupos.set(key, [fila]);
  }

  const resultado: CoberturaGrupo[] = [];
  for (const filas of grupos.values()) {
    const primera = filas[0];
    resultado.push({
      month_number: primera.month_number as number,
      year_number: primera.year_number as number,
      payment_type: primera.payment_type,
      ...calcularGrupo(filas, primera.payment_type, precios),
    });
  }

  return resultado;
}

/** Agrega la cobertura de un conjunto de filas de un mismo tipo. */
function calcularGrupo(
  filas: FilaCobertura[],
  tipo: string,
  precios: PreciosPorMetodo
): EstadoCobertura & { tienePendiente: boolean } {
  const preciosPorMetodo = precioCongelado(filas, tipo, precios);
  // Método "contratado": el del pago más antiguo.
  const ordenadas = [...filas].sort((a, b) => tiempo(a.created_at) - tiempo(b.created_at));
  const metodoPago = ordenadas[0]?.payment_method || "efectivo";

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

  const fraccionPagada = redondear2(fraccion);
  return {
    fraccionPagada,
    fraccionPendiente: redondear2(Math.max(0, 1 - fraccionPagada)),
    porcentaje: Math.min(100, Math.round(fraccionPagada * 100)),
    montoPagado: redondear2(montoPagado),
    preciosPorMetodo,
    metodoPago,
    tienePendiente,
  };
}

/**
 * Cobertura agregada de un TIPO de pago (p. ej. `inscripcion`), sin importar
 * mes/año: la inscripción es un único concepto por miembro cuyos abonos pueden
 * caer en meses distintos. Devuelve null si no hay pagos de ese tipo.
 */
export function calcularCoberturaTipo(
  detalles: FilaCobertura[],
  tipo: string,
  precios: PreciosPorMetodo = {}
): CoberturaGrupo | null {
  const filas = detalles.filter((f) => f.payment_type === tipo);
  if (filas.length === 0) return null;
  const primera = filas[0];
  return {
    month_number: primera.month_number ?? 0,
    year_number: primera.year_number ?? 0,
    payment_type: tipo,
    ...calcularGrupo(filas, tipo, precios),
  };
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

export interface GruposIndexados {
  mensualidad: Map<string, CoberturaGrupo>;
  suspensiones: Set<string>;
  inscripcion: CoberturaGrupo | null;
}

/** Indexa los grupos de un usuario por tipo (mes-año para meses, global para inscripción). */
export function indexarGrupos(grupos: CoberturaGrupo[]): GruposIndexados {
  const mensualidad = new Map<string, CoberturaGrupo>();
  const suspensiones = new Set<string>();
  let inscripcion: CoberturaGrupo | null = null;

  for (const grupo of grupos) {
    const key = `${grupo.month_number}-${grupo.year_number}`;
    if (grupo.payment_type === "suspension") suspensiones.add(key);
    else if (grupo.payment_type === "mensualidad") mensualidad.set(key, grupo);
    else if (grupo.payment_type === "inscripcion") {
      // La inscripción es global: se acumula (puede haber abonos en meses distintos).
      inscripcion = inscripcion === null ? grupo : fusionarGrupos(inscripcion, grupo);
    }
  }
  return { mensualidad, suspensiones, inscripcion };
}

/** Fusiona dos grupos de inscripción (suma fracciones y pagos). */
function fusionarGrupos(a: CoberturaGrupo, b: CoberturaGrupo): CoberturaGrupo {
  const fraccion = a.fraccionPagada + b.fraccionPagada;
  return {
    ...a,
    fraccionPagada: redondear2(fraccion),
    fraccionPendiente: redondear2(Math.max(0, 1 - fraccion)),
    porcentaje: Math.min(100, Math.round(fraccion * 100)),
    montoPagado: redondear2(a.montoPagado + b.montoPagado),
    tienePendiente: a.tienePendiente || b.tienePendiente,
    preciosPorMetodo: { ...b.preciosPorMetodo, ...a.preciosPorMetodo },
    metodoPago: a.metodoPago ?? b.metodoPago,
  };
}

/** Convierte las filas del RPC del dashboard al formato de cobertura. */
export function filasCoberturaDesdePagos(pagos: PagoRPCRow[]): FilaCobertura[] {
  return pagos.map((p) => ({
    user_id: p.user_id,
    month_number: p.month_number,
    year_number: p.year_number,
    payment_type: p.payment_type,
    payment_amount: Number(p.payment_amount ?? 0),
    expected_amount_usd:
      p.expected_amount_usd === null || p.expected_amount_usd === undefined
        ? null
        : Number(p.expected_amount_usd),
    status: p.status,
    payment_method: p.payment_method,
    created_at: p.created_at,
  }));
}

/**
 * Cobertura por usuario: `Map<userId, CoberturaGrupo[]>` con los grupos
 * (tipo, mes, año) de cada miembro (fracciones prorated, precio congelado).
 */
export function coberturasPorUsuario(
  detalles: FilaCobertura[],
  precios: PreciosPorMetodo = {}
): Map<string, CoberturaGrupo[]> {
  const porUsuario = new Map<string, FilaCobertura[]>();
  for (const fila of detalles) {
    const clave = fila.user_id;
    if (!clave) continue;
    const lista = porUsuario.get(clave);
    if (lista) lista.push(fila);
    else porUsuario.set(clave, [fila]);
  }

  const resultado = new Map<string, CoberturaGrupo[]>();
  for (const [userId, filas] of porUsuario) {
    resultado.set(userId, calcularCoberturaGrupos(filas, precios));
  }
  return resultado;
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
  estado: Pick<EstadoCobertura, "fraccionPendiente" | "preciosPorMetodo">,
  metodo: string,
  precioActual: number
): number {
  const precio = estado.preciosPorMetodo[metodo] ?? precioActual;
  if (!(precio > 0)) return 0;
  return redondear2(Math.max(0, estado.fraccionPendiente) * precio);
}

type ConceptoDeuda = Pick<EstadoCobertura, "fraccionPendiente" | "preciosPorMetodo" | "metodoPago">;

/**
 * Monto pendiente (USD) **por cada método de pago activo**.
 *
 * Regla de un método por concepto: un mes/inscripción ya iniciado con un método
 * solo se completa con ese método (precio congelado). Un concepto sin pagos se
 * puede pagar con cualquiera, así que se suma a todos los métodos al precio de
 * cada uno. Solo cuentan conceptos con fracción pendiente > 0.
 */
export function deudaPorMetodo(
  meses: ConceptoDeuda[],
  inscripcion: ConceptoDeuda | null,
  precios: PreciosPorMetodo = {}
): DeudaMetodo[] {
  return Object.keys(precios ?? {}).map((metodo) => {
    let total = 0;

    for (const mes of meses) {
      if (mes.fraccionPendiente <= 0) continue;
      if (mes.metodoPago && mes.metodoPago !== metodo) continue;
      const precio = mes.preciosPorMetodo[metodo] ?? precioMetodo(precios, metodo, "mensual");
      total += mes.fraccionPendiente * precio;
    }

    if (
      inscripcion &&
      inscripcion.fraccionPendiente > 0 &&
      (!inscripcion.metodoPago || inscripcion.metodoPago === metodo)
    ) {
      const precio =
        inscripcion.preciosPorMetodo[metodo] ?? precioMetodo(precios, metodo, "inscripcion");
      total += inscripcion.fraccionPendiente * precio;
    }

    return { metodo, totalUsd: redondear2(total) };
  });
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
