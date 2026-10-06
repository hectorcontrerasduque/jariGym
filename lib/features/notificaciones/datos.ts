import { pagosService } from "@/lib/features/pagos/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResumenDueno {
  pagosAprobados: number;
  pagosPendientes: number;
  montoCobrado: number;
  montoPendiente: number;
  montoDeuda: number;
  miembrosAlDia: number;
  miembrosDeudores: number;
  migraciones: number;
}

export interface EstatusSistema {
  totalMiembrosActivos: number;
  totalMiembrosInactivos: number;
  pagosAprobadosMes: number;
  pagosPendientesMes: number;
  montoRecaudadoMes: number;
  montoPendienteMes: number;
  capacidad: number;
  maxMiembros: number;
  ultimoMiembroRegistrado: string;
  ultimoPagoRegistrado: string;
  migraciones: number;
}

export interface ErrorNotificacion {
  tipo: string;
  fecha: string;
  detalle: string;
}

interface FrecuenciaConfig {
  daily_frequency?: boolean;
  weekly_frequency?: boolean;
  biweekly_frequency?: boolean;
  monthly_frequency?: boolean;
}

interface DetalleMes {
  payment_id: string;
  payment_amount: number | null;
}

/** Etiqueta visible del correo según la frecuencia activa de la notificación. */
export function etiquetaFrecuencia(config: FrecuenciaConfig): string {
  if (config.daily_frequency) return "Diario";
  if (config.weekly_frequency) return "Semanal";
  if (config.biweekly_frequency) return "Quincenal";
  return "Mensual";
}

/**
 * Detalles de pago del mes actual separados por el estado de su cabecera.
 * Un solo paso pequeño (payment_detail por mes+año) seguido de las cabeceras
 * implicadas, en vez de barrer todos los pagos de la tabla.
 */
export async function pagosDelMes(
  supabase: SupabaseClient,
  mes: number,
  anio: number
): Promise<{ aprobados: DetalleMes[]; pendientes: DetalleMes[] }> {
  const { data: detalles } = await supabase
    .from("payment_detail")
    .select("payment_id, payment_amount")
    .eq("month_number", mes)
    .eq("year_number", anio);

  const ids = [...new Set((detalles || []).map((d) => d.payment_id))];

  const { data: headers } = ids.length > 0
    ? await supabase.from("payments").select("id, status").in("id", ids)
    : { data: [] as Array<{ id: string; status: string }> };

  const statusMap = new Map((headers || []).map((p) => [p.id, p.status]));

  return {
    aprobados: (detalles || []).filter((d) => statusMap.get(d.payment_id) === "aprobado"),
    pendientes: (detalles || []).filter((d) => statusMap.get(d.payment_id) === "pendiente"),
  };
}

/** Datos del "Resumen de Pagos" enviado al propietario. */
export async function calcularResumenDueno(supabase: SupabaseClient): Promise<ResumenDueno> {
  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const elegibles = await pagosService.getMiembrosElegibles(supabase);
  const miembrosActivos = elegibles.miembros.filter(
    (m) => m.email?.toLowerCase() !== elegibles.ownerEmail
  ).length;

  const morosos = await pagosService.getMiembrosMorosos(anioActual, supabase, elegibles);
  const miembrosDeudores = morosos.filter((m) => m.mesesDeuda.length > 0).length;
  const montoDeuda = morosos.reduce((sum, m) => sum + m.totalDeuda, 0);

  const { aprobados, pendientes } = await pagosDelMes(supabase, mesActual, anioActual);

  const { count: migraciones } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "migrado");

  return {
    pagosAprobados: aprobados.length,
    pagosPendientes: pendientes.length,
    montoCobrado: aprobados.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
    montoPendiente: pendientes.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
    montoDeuda,
    miembrosAlDia: miembrosActivos - miembrosDeudores,
    miembrosDeudores,
    migraciones: migraciones || 0,
  };
}

/** Métricas y errores recientes del correo "Estado del Sistema". */
export async function calcularEstatusSistema(
  supabase: SupabaseClient,
  gymConfig: Record<string, unknown>
): Promise<{ metricas: EstatusSistema; errores: ErrorNotificacion[] }> {
  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const { count: totalActivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "miembro")
    .eq("activo", true);

  const { count: totalInactivos } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "miembro")
    .eq("activo", false);

  const { aprobados, pendientes } = await pagosDelMes(supabase, mesActual, anioActual);

  const { data: ultimoMiembro } = await supabase
    .from("profiles")
    .select("full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: ultimoPago } = await supabase
    .from("payments")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: errores } = await supabase
    .from("notification_log")
    .select("error_detail, sent_at, notification_config(notification_type)")
    .eq("no_issues", false)
    .order("sent_at", { ascending: false })
    .limit(10);

  const { count: migraciones } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "migrado");

  const erroresFormateados = (errores || []).map((e) => ({
    tipo: (e as unknown as { notification_config?: { notification_type?: string } })
      .notification_config?.notification_type || "desconocido",
    fecha: new Date(e.sent_at).toLocaleDateString("es-ES"),
    detalle: e.error_detail || "Sin detalle",
  }));

  return {
    metricas: {
      totalMiembrosActivos: totalActivos || 0,
      totalMiembrosInactivos: totalInactivos || 0,
      pagosAprobadosMes: aprobados.length,
      pagosPendientesMes: pendientes.length,
      montoRecaudadoMes: aprobados.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
      montoPendienteMes: pendientes.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
      capacidad: totalActivos || 0,
      maxMiembros: typeof gymConfig.max_members === "number" ? gymConfig.max_members : 50,
      ultimoMiembroRegistrado: ultimoMiembro?.full_name || "N/A",
      ultimoPagoRegistrado: ultimoPago
        ? new Date(ultimoPago.created_at).toLocaleDateString("es-ES")
        : "N/A",
      migraciones: migraciones || 0,
    },
    errores: erroresFormateados,
  };
}
