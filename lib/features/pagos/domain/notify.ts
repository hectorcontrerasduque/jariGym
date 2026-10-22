/**
 * Derivación de eventos de pago para `POST /api/pagos/notify`.
 * Puro (sin I/O): el servidor decide la notificación por el ESTADO REAL en BD
 * y el rol del llamador — nunca por lo que el cliente afirme en el body.
 *
 * - `aprobado` / `rechazado` (solo super_admin): notifica al MIEMBRO (solo push, sin correo).
 * - `reportado` (miembro dueño, pago pendiente): notifica a los ADMINS (push).
 * - `registrado` (super_admin, pago pendiente de un tercero): notifica al MIEMBRO (push).
 * - `sin_evento`: acción válida que no notifica a nadie (ej. admin crea un pago
 *   pendiente para sí mismo).
 * - `denegado` / `estado_invalido`: 403 / 400.
 */

export type EventoPago = "aprobado" | "rechazado" | "reportado" | "registrado";
export type DecisionNotify = EventoPago | "sin_evento" | "denegado" | "estado_invalido";

export function derivarEventoPago(params: {
  status: string;
  callerRole: string | null;
  esDueno: boolean;
}): DecisionNotify {
  const { status, callerRole, esDueno } = params;

  if (callerRole === "super_admin") {
    if (status === "aprobado") return "aprobado";
    if (status === "rechazado") return "rechazado";
    if (status === "pendiente") return esDueno ? "sin_evento" : "registrado";
    return "estado_invalido";
  }

  if (callerRole === "miembro" && esDueno && status === "pendiente") {
    return "reportado";
  }

  return "denegado";
}
