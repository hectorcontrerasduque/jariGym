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

export interface Membership {
  id: string;
  user_id: string;
  status: "activa" | "vencida" | "cancelada";
  start_date: string;
  end_date: string | null;
  assigned_by: string | null;
  membership_note: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type MetodoPago = "efectivo" | "bs" | "binance";

export type TipoPago = "mensualidad" | "inscripcion";

// Payment = cabecera del pago (tabla payments)
export interface Payment {
  id: string;
  user_id: string;
  status: "pendiente" | "aprobado" | "rechazado" | "suspendido" | "suspendido_pendiente";
  payment_method: MetodoPago;
  bill_code: string | null;
  receipt_url: string | null;
  payment_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  profile?: Profile;
  approved_by_profile?: Profile;
  created_by_profile?: Profile;
  detail?: PaymentDetail[];
}

// PaymentDetail = detalle por mes o inscripcion (tabla payment_detail)
export interface PaymentDetail {
  id: string;
  payment_id: string;
  month_number: number | null;
  year_number: number | null;
  payment_type: TipoPago;
  payment_amount: number;
}

// PaymentWithDetail = cabecera con detalle incluido (para queries con JOIN)
export interface PaymentWithDetail extends Payment {
  detail: PaymentDetail[];
}

// Backward compatibility aliases
export type Pago = Payment;
export type DetallePago = PaymentDetail;
export type PagoConDetalle = PaymentWithDetail;

export type TipoMovimiento = "inscripcion" | "mensualidad" | "otros";

export type ModoCobro = "dia_uno" | "fecha_inscripcion";

export interface Movimiento {
  id: string;
  user_id: string;
  tipo: TipoMovimiento;
  payment_amount: number;
  payment_method: MetodoPago;
  receipt_url: string | null;
  bill_code: string | null;
  payment_note: string | null;
  month_number: number | null;
  year_number: number | null;
  status: "pendiente" | "aprobado" | "rechazado" | "suspendido" | "suspendido_pendiente";
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
  notification_type: TipoNotificacion;
  is_active: boolean;
  daily_frequency: boolean;
  weekly_frequency: boolean;
  biweekly_frequency: boolean;
  monthly_frequency: boolean;
  days_before: number;
  notify_by_email: boolean;
  notify_by_whatsapp: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface NotificacionLog {
  id: string;
  notification_config_id: string;
  members_notified: number;
  sent_at: string;
  no_issues: boolean;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  notification_config?: NotificacionConfig;
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
