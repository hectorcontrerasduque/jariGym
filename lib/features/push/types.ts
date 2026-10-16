/** Claves de cifrado de una suscripción Web Push (esquema aes128gcm). */
export interface ClavesPush {
  p256dh: string;
  auth: string;
}

/** Suscripción registrada en un dispositivo (1 fila en `push_subscriptions`). */
export interface SuscripcionPush {
  endpoint: string;
  keys: ClavesPush;
}

/** Contenido mostrado por el Service Worker al llegar la notificación. */
export interface PayloadPush {
  title: string;
  body: string;
  /** Ruta relativa que abre la app al tocar la notificación (ej. "/dashboard/pagos"). */
  url: string;
}

/** Por qué un envío de push no se intentó (o falló de forma fero). */
export type MotivoOmitidoPush = "sin_configurar" | "deshabilitado" | "error";

/**
 * Resultado de un intento de envío. El módulo de push NUNCA lanza excepciones
 * (fail-open): un fallo de push jamás debe cortar correos, cron ni guardados.
 */
export interface ResultadoPush {
  enviados: number;
  fallos: number;
  /** `null` cuando al menos algo se intentó; motivo cuando se omitió por completo. */
  omitido: MotivoOmitidoPush | null;
}

/** Acciones posibles del intento de activación desde el navegador. */
export type ResultadoActivacionPush =
  | "activado"
  | "ya-activo"
  | "denegado"
  | "deshabilitado"
  | "sin-soporte"
  | "sin-clave"
  | "error";
