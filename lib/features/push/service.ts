import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification, setVapidDetails, WebPushError } from "web-push";
import type { PayloadPush, ResultadoPush } from "./types";

/**
 * Envío de Web Push (servidor). Nunca lanza excepciones: siempre devuelve un
 * `ResultadoPush`. Ver AGENTS.md → Web Push.
 *
 * Orden de compuertas: sin claves VAPID → "sin_configurar";
 * `gym_config.push_enabled = false` → "deshabilitado" (sin tocar la red).
 */

const SUBJECT =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.GMAIL_USER ? `mailto:${process.env.GMAIL_USER}` : "https://jarigym.app");

/** 404/410 = el navegador dio de baja la suscripción: se limpia la fila. */
const STATUS_CADUCA = [404, 410];

interface SuscripcionFila {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const vacio = (): ResultadoPush => ({ enviados: 0, fallos: 0, omitido: null });

/** ¿El servidor tiene claves VAPID (NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY + WEB_PUSH_PRIVATE_KEY)? */
export function pushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY);
}

/**
 * Interruptor maestro `gym_config.push_enabled`. Si la migración 058 aún no se
 * aplicó (columna inexistente) u hay cualquier error de lectura → apagado.
 */
export async function pushHabilitado(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("gym_config")
      .select("push_enabled")
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return data?.push_enabled === true;
  } catch {
    return false;
  }
}

/**
 * Envía un push a los usuarios indicados (suscripciones activas de cada uno).
 * Limpia endpoints caducos (404/410). Fail-open: jamás lanza.
 */
export async function enviarPushAUsuarios(
  supabase: SupabaseClient,
  userIds: string[],
  payload: PayloadPush
): Promise<ResultadoPush> {
  if (userIds.length === 0) return vacio();
  return enviar(supabase, payload, async () => userIds);
}

/**
 * Envía un push a todos los perfiles `super_admin` activos (propietario,
 * técnico y restantes; `activo IS NOT FALSE` incluye `null`). Fail-open.
 * `opciones.excluir` omite un id (ej. no avisar al creador de la acción).
 */
export async function enviarPushAAdmins(
  supabase: SupabaseClient,
  payload: PayloadPush,
  opciones?: { excluir?: string }
): Promise<ResultadoPush> {
  return enviar(supabase, payload, async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .not("activo", "is", false);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string }>)
      .map((a) => a.id)
      .filter((id) => id !== opciones?.excluir);
  });
}

/**
 * Núcleo compartido: compuertas (claves VAPID → `push_enabled`) y SOLO si
 * ambas pasan se resuelven los destinatarios y se envía. Nunca lanza.
 */
async function enviar(
  supabase: SupabaseClient,
  payload: PayloadPush,
  obtenerUserIds: () => Promise<string[]>
): Promise<ResultadoPush> {
  const res = vacio();
  if (!pushConfigurado()) return { ...res, omitido: "sin_configurar" };
  try {
    if (!(await pushHabilitado(supabase))) return { ...res, omitido: "deshabilitado" };

    const userIds = await obtenerUserIds();
    if (userIds.length === 0) return res;

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (error || !data || data.length === 0) return res;
    const subs = data as SuscripcionFila[];

    try {
      setVapidDetails(
        SUBJECT,
        process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY!,
        process.env.WEB_PUSH_PRIVATE_KEY!
      );
    } catch {
      return { ...res, omitido: "sin_configurar" };
    }

    const body = JSON.stringify(payload);
    for (const sub of subs) {
      try {
        await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        res.enviados += 1;
      } catch (err) {
        const status = err instanceof WebPushError ? err.statusCode : undefined;
        if (status !== undefined && STATUS_CADUCA.includes(status)) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        res.fallos += 1;
      }
    }
  } catch {
    if (res.enviados === 0 && res.fallos === 0) return { ...res, omitido: "error" };
  }
  return res;
}
