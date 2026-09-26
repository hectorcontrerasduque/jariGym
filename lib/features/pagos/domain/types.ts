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
  totalDeuda: number;
  debeInscripcion: boolean;
  mesesDeuda: number[];
  pagosPendientes: number;
  montoPendiente: number;
}

export interface MesPendiente {
  month_number: number;
  year_number: number;
}
