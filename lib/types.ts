export interface Profile {
  id: string;
  email: string | null;
  nombre_completo: string;
  avatar_url: string | null;
  whatsapp: string | null;
  cedula: string | null;
  horario_entreno: string | null;
  hora_llegada: string | null;
  hora_salida: string | null;
  role: "super_admin" | "admin" | "miembro";
  activo: boolean;
  fecha_inscripcion: string;
  monto_inscripcion_pagado: number;
  inscripcion_pagada: boolean;
  inscripcion_fecha: string | null;
  notas_admin: string | null;
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

export type TipoPago = "membresia" | "inscripcion";

export interface Pago {
  id: string;
  usuario_id: string;
  monto: number;
  comprobante_url: string | null;
  estado: "pendiente" | "aprobado" | "rechazado" | "suspendido_pendiente" | "suspendido";
  metodo_pago: MetodoPago;
  tipo_pago: TipoPago;
  codigo_billete: string | null;
  notas: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  fecha_pago_real: string | null;
  mes_pagar: number;
  anio_pagar: number;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  approved_by_profile?: Profile;
  created_by_profile?: Profile;
}

export type TipoMovimiento = "inscripcion" | "mensualidad" | "otros";

export interface Movimiento {
  id: string;
  usuario_id: string;
  tipo: TipoMovimiento;
  monto: number;
  metodo_pago: MetodoPago;
  comprobante_url: string | null;
  codigo_billete: string | null;
  notas: string | null;
  mes_pagar: number | null;
  anio_pagar: number | null;
  estado: "pendiente" | "aprobado" | "rechazado" | "suspendido";
  activo: boolean;
  approved_by: string | null;
  approved_at: string | null;
  fecha_pago_real: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface GymConfig {
  id: string;
  nombre_gym: string | null;
  max_miembros: number;
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
  notificaciones_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetodoPagoConfig {
  id: string;
  metodo_pago: MetodoPago;
  monto_mensual: number;
  monto_inscripcion: number;
  habilitado: boolean;
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
  whatsapp: string | null;
  correo: string | null;
  mes_pagar: number;
  anio_pagar: number;
  estado: EstadoPagoMigracion;
  migrado: "si" | "no";
  created_at: string;
}
