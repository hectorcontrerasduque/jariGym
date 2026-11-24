/** One row per payment detail line, as returned by the `get_pagos_por_anio` RPC. */
export interface PagoRPCRow {
  id: string;
  user_id: string;
  status: string;
  payment_note: string | null;
  payment_method: string | null;
  bill_code: string | null;
  receipt_url: string | null;
  created_at: string;
  month_number: number;
  year_number: number;
  payment_amount: number;
  payment_type: string;
  /** Precio congelado del método al momento del pago (migración 065). */
  expected_amount_usd: number | null;
}

export type ModoCobro = "dia_uno" | "fecha_inscripcion";

export interface MiembroElegible {
  id: string;
  email: string | null;
  full_name: string | null;
  inscription_paid: boolean;
  activo: boolean | null;
  start_date: string | null;
  avatar_url: string | null;
  role: string | null;
  inscription_admin_note: string | null;
  arrival_time: string | null;
  departure_time: string | null;
}

export interface ElegiblesResult {
  miembros: MiembroElegible[];
  miembrosLibresIds: Set<string>;
  fechaInicioMap: Map<string, string>;
  ownerEmail: string;
  modoCobro: ModoCobro;
  montoMensual: number;
  montoInscripcion: number;
  /** Precios de TODOS los métodos activos (para deuda por método). */
  preciosPorMetodo: PreciosPorMetodo;
}

/** Precio actual por método y tipo (fallback cuando no hay snapshot). */
export type PreciosPorMetodo = Record<string, { mensual: number; inscripcion: number }>;

export interface DeudaMetodo {
  metodo: string;
  totalUsd: number;
}

export interface Deuda {
  month_number: number;
  year_number: number;
  payment_amount: number;
}

export interface Moroso {
  id: string;
  email: string;
  full_name: string;
  deudas: Deuda[];
  /** Deuda al precio del método principal (referencia, parcial-aware). */
  totalDeuda: number;
  /** Deuda desglosada por método activo. */
  deudaPorMetodo: DeudaMetodo[];
  debeInscripcion: boolean;
  mesesDeuda: number[];
  pagosPendientes: number;
  montoPendiente: number;
}

export interface MesPendiente {
  month_number: number;
  year_number: number;
}

/**
 * Mes con su cobertura por monto (pagos parciales). La fracción pagada se
 * calcula como Σ (payment_amount / expected_amount_usd) de los pagos aprobados,
 * usando el precio congelado del método para ese mes (prorated por método).
 */
/** Estado de cobertura por monto de un concepto (mes o inscripción). */
export interface EstadoCobertura {
  /** Fracción cubierta (0..N; >= 1 = pagado). */
  fraccionPagada: number;
  /** Fracción que falta (>= 0). */
  fraccionPendiente: number;
  /** Porcentaje visible (0-100). */
  porcentaje: number;
  /** USD efectivamente pagados (solo aprobados). */
  montoPagado: number;
  /** Precio congelado por método de pago. */
  preciosPorMetodo: Record<string, number>;
  /** Método con el que arrancó el pago (null si no tiene pagos). */
  metodoPago: string | null;
}

export interface MesConCobertura extends MesPendiente, EstadoCobertura {}
