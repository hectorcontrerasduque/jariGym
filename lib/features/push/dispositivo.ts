import type { ResultadoActivacionPush, SuscripcionPush } from "./types";

/**
 * Lado cliente de Web Push: permisos del navegador, Service Worker y
 * sincronización de la suscripción con `/api/push/subscriptions`.
 * Solo lo importan componentes "use client" (nunca el servidor).
 */

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
const RUTA_SW = "/sw.js";

/** ¿Este navegador puede recibir push (SW + PushManager + Notification + claves)? */
export function pushSoportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(CLAVE_PUBLICA)
  );
}

/** Estado actual del permiso de notificaciones del navegador. */
export function estadoPermiso(): NotificationPermission | "unsupported" {
  if (!pushSoportado()) return "unsupported";
  return Notification.permission;
}

/** Registra el Service Worker (idempotente). Devuelve null si no hay soporte. */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSoportado()) return null;
  try {
    return await navigator.serviceWorker.register(RUTA_SW);
  } catch {
    return null;
  }
}

/** ¿Está este dispositivo suscrito (localmente) ahora mismo? */
export async function estaSuscrito(): Promise<boolean> {
  if (!pushSoportado()) return false;
  try {
    const reg = await registrarServiceWorker();
    return (await reg?.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

function aSuscripcion(sub: PushSubscription): SuscripcionPush {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint ?? "",
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

async function sincronizar(metodo: "POST" | "DELETE", payload: SuscripcionPush): Promise<number> {
  const res = await fetch("/api/push/subscriptions", {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return res.status;
}

/**
 * ¿Debe la auto-suscripción de miembros marcar su intento por dispositivo?
 * - Terminal: quedó suscrito (activado/ya-activo) o el permiso quedó DENEGADO
 *   (nada más que reintentar → no volver a molestar con el aviso).
 * - NO marca si el socio solo cerró el aviso (permiso sigue "default") o si
 *   falló la sincronización con el servidor → la próxima visita reintenta.
 */
export function debeMarcarIntento(
  resultado: ResultadoActivacionPush,
  permisoFinal: NotificationPermission | "unsupported"
): boolean {
  if (permisoFinal === "denied") return true;
  return resultado === "activado" || resultado === "ya-activo";
}

/** Estados posibles del push en este dispositivo (compartidos: campana + modal). */
export type EstadoPush = "cargando" | "activo" | "inactivo" | "bloqueado" | "sin-soporte";

/** Calcula el estado actual: soporte → permiso del navegador → suscripción local. */
export async function calcularEstadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return "sin-soporte";
  const permiso = estadoPermiso();
  if (permiso === "denied") return "bloqueado";
  if (permiso === "granted" && (await estaSuscrito())) return "activo";
  return "inactivo";
}

/**
 * ¿Debe mostrarse el modal de activación de push al enviar un pago?
 * Solo si el permiso sigue SIN DECIDIR (default). Bloqueado o sin soporte
 * pasan directo: el pago nunca depende de las notificaciones (fail-open).
 */
export function debePedirActivacion(estado: EstadoPush): boolean {
  return estado === "inactivo";
}

/**
 * Re-sincroniza la suscripción LOCAL con el servidor (POST upsert, idempotente).
 * Garantiza que, si la campana muestra "activo", exista fila en
 * `push_subscriptions` para el usuario de la SESIÓN ACTUAL: el permiso y la
 * suscripción local son por origen (compartidos entre cuentas en un mismo
 * navegador), mientras que la fila en BD es por usuario — sin este paso la
 * campana puede decir "activas" y el servidor no tener adónde enviar.
 * Devuelve el status HTTP o null si no hay suscripción/soporte.
 */
export async function sincronizarSuscripcion(): Promise<number | null> {
  if (!pushSoportado()) return null;
  try {
    const reg = await registrarServiceWorker();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    return await sincronizar("POST", aSuscripcion(sub));
  } catch {
    return null;
  }
}

/**
 * Pide permiso, suscribe el navegador y registra la suscripción en el servidor.
 * Si el servidor la rechaza (409/4xx), se da de baja localmente para no dejar
 * una suscripción huérfana.
 */
export async function activarPush(): Promise<ResultadoActivacionPush> {
  if (!pushSoportado()) return "sin-soporte";
  if (!CLAVE_PUBLICA) return "sin-clave";
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return "denegado";
    const reg = await registrarServiceWorker();
    if (!reg) return "error";

    const existente = await reg.pushManager.getSubscription();
    const sub =
      existente ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: CLAVE_PUBLICA,
      }));

    const status = await sincronizar("POST", aSuscripcion(sub));
    if (status < 200 || status >= 300) {
      if (existente) await existente.unsubscribe().catch(() => false);
      if (status === 409) return "deshabilitado";
      return "error";
    }
    return existente ? "ya-activo" : "activado";
  } catch {
    return "error";
  }
}

/**
 * Desactiva este dispositivo: baja local (unsubscribe) y en el servidor
 * (mejor esfuerzo). Devuelve true si al final no queda suscripción local.
 */
export async function desactivarPush(): Promise<boolean> {
  if (!pushSoportado()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await sincronizar("DELETE", { endpoint, keys: { p256dh: "", auth: "" } });
    return true;
  } catch {
    return false;
  }
}
