/**
 * Reglas de frecuencia de las notificaciones. Funciones puras: la fecha del
 * último envío la consulta la ruta, aquí solo se decide si corresponde ejecutar.
 */

export type ConfigFrecuencia = {
  notification_type: string;
  daily_frequency?: boolean;
  weekly_frequency?: boolean;
  biweekly_frequency?: boolean;
  monthly_frequency?: boolean;
};

/**
 * Piso de 7 días entre avisos de deuda, aunque la frecuencia configurada sea
 * diaria. Reenviar el mismo "te deben dinero" todos los días al mismo socio
 * daña el deliverability (spam) y el historial del dominio.
 */
export const MIN_DIAS_AVISO_DEUDA = 7;

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * ¿Corresponde ejecutar esta notificación ahora?
 * @param config fila de `notification_config`
 * @param ultimoEnvio `sent_at` del último envío **exitoso** (null = nunca)
 */
export function verificarFrecuencia(
  config: ConfigFrecuencia,
  ultimoEnvio: string | Date | null
): boolean {
  const tieneFrecuencia =
    !!config.daily_frequency ||
    !!config.weekly_frequency ||
    !!config.biweekly_frequency ||
    !!config.monthly_frequency;
  if (!tieneFrecuencia) return false;

  if (!ultimoEnvio) return true;

  const diasDesdeUltimo = (Date.now() - new Date(ultimoEnvio).getTime()) / MS_POR_DIA;
  if (Number.isNaN(diasDesdeUltimo)) return true;

  if (
    config.notification_type === "miembros_deudores" &&
    diasDesdeUltimo < MIN_DIAS_AVISO_DEUDA
  ) {
    return false;
  }

  if (config.daily_frequency && diasDesdeUltimo >= 1) return true;
  if (config.weekly_frequency && diasDesdeUltimo >= 7) return true;
  if (config.biweekly_frequency && diasDesdeUltimo >= 15) return true;
  if (config.monthly_frequency && diasDesdeUltimo >= 30) return true;

  return false;
}
