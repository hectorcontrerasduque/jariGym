/**
 * Reglas de frecuencia de las notificaciones. Funciones puras: la fecha del
 * último envío la consulta la ruta, aquí solo se decide si corresponde ejecutar.
 *
 * Modelo de calendario (no de días transcurridos):
 *
 *   fecha_envio = fecha_objetivo(frecuencia) − days_before
 *
 * - Diaria     → todos los días (days_before no aplica)
 * - Semanal    → lunes
 * - Quincenal  → 15 y último día del mes
 * - Mensual    → último día del mes
 *
 * `days_before` (días de anticipación) lo controla el formulario y su default
 * es 0. Con la inversión `hoy + days_before ∈ fecha_objetivo` la comprobación
 * es un solo cálculo para cualquier N.
 */

export type ConfigFrecuencia = {
  notification_type: string;
  daily_frequency?: boolean;
  weekly_frequency?: boolean;
  biweekly_frequency?: boolean;
  monthly_frequency?: boolean;
  days_before?: number | null;
};

/**
 * Piso de 7 días entre avisos de deuda, aunque la frecuencia configurada sea
 * diaria. Reenviar el mismo "te deben dinero" todos los días al mismo socio
 * daña el deliverability (spam) y el historial del dominio.
 * Constante de código (sin campo en BD): aplica siempre al tipo
 * `miembros_deudores`, en adición a cualquier anticipación (`days_before`).
 */
export const MIN_DIAS_AVISO_DEUDA = 7;

const MS_POR_DIA = 1000 * 60 * 60 * 24;
const MS_POR_HORA = 1000 * 60 * 60;
/** VET = UTC−4, sin horario de verano. */
const OFFSET_VET_MS = -4 * MS_POR_HORA;

/**
 * Fecha cuyos campos UTC representan el calendario de Venezuela (VET).
 * El cron corre ≥04:00 UTC (= medianoche VET en adelante), así que el día
 * VET y el UTC coinciden en la práctica; usamos VET para que el horario del
 * deploy no desalinee lunes/15/fin de mes.
 */
export function hoyVet(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + OFFSET_VET_MS);
}

export function esLunes(fecha: Date): boolean {
  return fecha.getUTCDay() === 1;
}

export function ultimoDiaDelMes(fecha: Date): number {
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

export function esFinDeMes(fecha: Date): boolean {
  return fecha.getUTCDate() === ultimoDiaDelMes(fecha);
}

/** Objetivo de la frecuencia quincenal: 15 o último día del mes. */
export function esDia15oFinDeMes(fecha: Date): boolean {
  return fecha.getUTCDate() === 15 || esFinDeMes(fecha);
}

/** ¿Mismo día de calendario (VET) para ambas fechas? */
export function mismoDiaVet(
  a: string | Date,
  b: string | Date = new Date()
): boolean {
  const x = a instanceof Date ? a : new Date(a);
  const y = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(x.getTime()) || Number.isNaN(y.getTime())) return false;
  const dx = hoyVet(x);
  const dy = hoyVet(y);
  return (
    dx.getUTCFullYear() === dy.getUTCFullYear() &&
    dx.getUTCMonth() === dy.getUTCMonth() &&
    dx.getUTCDate() === dy.getUTCDate()
  );
}

function diasCalendarioVet(desde: Date, hasta: Date): number {
  const d0 = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const d1 = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((d1 - d0) / MS_POR_DIA);
}

/**
 * ¿Corresponde ejecutar esta notificación hoy?
 *
 * @param config fila de `notification_config`
 * @param ultimoEnvio último intento registrado (null = nunca → siempre corre)
 * @param hoy instante de referencia (raw; por defecto ahora). Los días de
 *   calendario se leen siempre en VET dentro de la función.
 */
export function verificarFrecuencia(
  config: ConfigFrecuencia,
  ultimoEnvio: string | Date | null,
  hoy: Date = new Date()
): boolean {
  const tieneFrecuencia =
    !!config.daily_frequency ||
    !!config.weekly_frequency ||
    !!config.biweekly_frequency ||
    !!config.monthly_frequency;
  if (!tieneFrecuencia) return false;

  // Primera vuelta (sin bitácora): corre sin importar el día objetivo.
  if (!ultimoEnvio) return true;

  const ultimo = new Date(ultimoEnvio);
  if (Number.isNaN(ultimo.getTime())) return true;

  // Una corrida por día de calendario (el cron puede invocarse dos veces).
  if (mismoDiaVet(hoy, ultimo)) return false;

  // Piso anti-spam solo para avisos de deuda.
  if (config.notification_type === "miembros_deudores") {
    const diasDesdeUltimo = diasCalendarioVet(hoyVet(ultimo), hoyVet(hoy));
    if (diasDesdeUltimo < MIN_DIAS_AVISO_DEUDA) return false;
  }

  // Diaria: todos los días (days_before no aplica).
  if (config.daily_frequency) return true;

  // Inversión: si hoy es (fecha_objetivo − days_before), entonces
  // hoy + days_before cae en un fecha_objetivo.
  const lead = Math.max(0, config.days_before ?? 0);
  const objetivo = new Date(hoyVet(hoy).getTime() + lead * MS_POR_DIA);

  if (config.weekly_frequency) return esLunes(objetivo);
  if (config.biweekly_frequency) return esDia15oFinDeMes(objetivo);
  if (config.monthly_frequency) return esFinDeMes(objetivo);
  return false;
}
