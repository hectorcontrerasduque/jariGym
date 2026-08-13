export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  plan_suscripcion: "free" | "basic" | "pro" | "enterprise";
  max_miembros: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  email: string | null;
  nombre_completo: string;
  avatar_url: string | null;
  whatsapp: string | null;
  cedula: string | null;
  horario_entreno: string | null;
  role: "super_admin" | "admin" | "miembro";
  estado: "activo" | "suspendido" | "inactivo";
  activo: boolean;
  fecha_inscripcion: string;
  monto_inscripcion_pagado: number;
  inscripcion_pagada: boolean;
  inscripcion_fecha: string | null;
  membresia_libre: boolean;
  notas_admin: string | null;
  notas_estado: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  tenant_id: string;
  nombre: string;
  precio: number;
  duracion_dias: number;
  activo: boolean;
  created_at: string;
}

export interface Membresia {
  id: string;
  tenant_id: string;
  usuario_id: string;
  plan_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "activa" | "vencida" | "cancelada";
  created_at: string;
  plan?: Plan;
}

export type MetodoPago = "efectivo" | "bs" | "binance" | "transferencia" | "membresia_libre";

export interface Pago {
  id: string;
  tenant_id: string;
  usuario_id: string;
  membresia_id: string | null;
  monto: number;
  comprobante_url: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  metodo_pago: MetodoPago;
  codigo_billete: string | null;
  notas: string | null;
  approved_by: string | null;
  approved_at: string | null;
  fecha_pago_real: string | null;
  mes_pagar: number;
  anio_pagar: number;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  membresia?: Membresia;
  approved_by_profile?: Profile;
}

export interface GymConfig {
  id: string;
  tenant_id: string;
  nombre_gym: string | null;
  logo_url: string | null;
  direccion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  horario: string | null;
  dueno_nombre: string | null;
  dueno_email: string | null;
  dueno_telefono: string | null;
  moneda: string;
  timezone: string;
  color_primario: string;
  color_secundario: string;
  monto_mensual: number;
  monto_inscripcion: number;
  monto_mensual_bs: number;
  monto_inscripcion_bs: number;
  monto_mensual_binance: number;
  monto_inscripcion_binance: number;
  monto_mensual_transferencia: number;
  monto_inscripcion_transferencia: number;
  acepta_bs: boolean;
  acepta_binance: boolean;
  acepta_transferencia: boolean;
  acepta_efectivo: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificacionesConfig {
  id: string;
  usuario_id: string;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  whatsapp_number: string | null;
  recordatorio_dias_antes: number;
  created_at: string;
}

export interface NotificacionLog {
  id: string;
  tenant_id: string;
  usuario_id: string | null;
  tipo: "pago_pendiente" | "pago_atrasado" | "pago_confirmado" | "membresia_vence";
  canal: "whatsapp" | "email";
  enviado: boolean;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
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
