export interface Profile {
  id: string;
  role: "super_admin" | "miembro";
  email: string | null;
  document_id: string | null;
  full_name: string;
  start_date: string;
  phone_number: string | null;
  avatar_url: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  inscription_amount_paid: number;
  inscription_paid: boolean;
  inscription_date: string | null;
  inscription_admin_note: string | null;
  /** null = active (legacy profiles), false = inactive, true = explicitly active. Always use `activo !== false` to check active status. */
  activo: boolean | null;
  registered: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membresia {
  id: string;
  usuario_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  asignado_por: string | null;
  asignado_por_nombre: string | null;
  estado: "activa" | "vencida" | "cancelada";
  created_at: string;
}

export type MetodoPago = "efectivo" | "bs" | "binance";

export type TipoPago = "mensualidad" | "inscripcion";

// Pago = cabecera del pago (tabla pagos)
export interface Pago {
  id: string;
  usuario_id: string;
  estado: "pendiente" | "aprobado" | "rechazado" | "suspendido";
  metodo_pago: MetodoPago;
  codigo_billete: string | null;
  comprobante_url: string | null;
  notas: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  approved_by_profile?: Profile;
  created_by_profile?: Profile;
  detalle?: DetallePago[];
}

// DetallePago = detalle por mes o inscripcion (tabla detalle_pago)
export interface DetallePago {
  id: string;
  pago_id: string;
  mes: number | null;
  anio: number | null;
  tipo_pago: TipoPago;
  monto: number;
}

// PagoConDetalle = cabecera con detalle incluido (para queries con JOIN)
export interface PagoConDetalle extends Pago {
  detalle: DetallePago[];
}

export type TipoMovimiento = "inscripcion" | "mensualidad" | "otros";

export type ModoCobro = "dia_uno" | "fecha_inscripcion";

export interface Movimiento {
  id: string;
  usuario_id: string;
  tipo: TipoMovimiento;
  monto: number;
  metodo_pago: MetodoPago;
  comprobante_url: string | null;
  codigo_billete: string | null;
  notas: string | null;
  mes: number | null;
  anio: number | null;
  estado: "pendiente" | "aprobado" | "rechazado" | "suspendido";
  activo: boolean | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface GymConfig {
  id: string;
  logo_url: string | null;
  gym_name: string | null;
  max_members: number;
  address: string | null;
  phone_number: string | null;
  contact_email: string | null;
  schedule: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  billing_mode: ModoCobro;
  notificaciones_enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PaymentMethod {
  id: string;
  payment_method: MetodoPago;
  amount_monthly: number;
  amount_inscription: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoNotificacion =
  | "miembros_deudores"
  | "recordatorio_pago"
  | "resumen_dueno"
  | "estatus_sistema";

export interface NotificacionConfig {
  id: string;
  tipo_notificacion: TipoNotificacion;
  habilitado: boolean;
  frecuencia_diaria: boolean;
  frecuencia_semanal: boolean;
  frecuencia_quincenal: boolean;
  frecuencia_mensual: boolean;
  dias_previo: number;
  notificar_por_email: boolean;
  notificar_por_whatsapp: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificacionLog {
  id: string;
  id_notificacion_config: string;
  miembros_notificados: number;
  fecha_hora_envio: string;
  sin_problemas: boolean;
  error_detalle: string | null;
  created_at: string;
  updated_at: string;
  notificacion_config?: NotificacionConfig;
}

export interface DashboardStats {
  totalMiembros: number;
  inscritosPagados: number;
  inscritosPendientes: number;
  deudoresMensualidad: number;
  alDiaMensualidad: number;
  montoDeuda: number;
  montoPagado: number;
  membresiaLibre: number;
  pagosConfirmados: number;
  pagosPendientes: number;
  ingresosMes: number;
}

export type EstadoPagoMigracion = "pagado" | "suspendido" | "debe";

export interface MigracionRecord {
  id: number;
  nombre: string;
  correos: string[];
  migrado: "si" | "no";
  created_at: string;
}
