import type { ElegiblesResult, MiembroElegible, ModoCobro } from "./types";

export interface ElegiblesInput {
  /** profiles with role miembro/super_admin and non-null email */
  perfiles: MiembroElegible[] | null;
  /** active gym_config_payment_methods row */
  metodoPago: { amount_monthly: number | null; amount_inscription: number | null } | null;
  /** active memberships without end date */
  membresias: Array<{ user_id: string; start_date: string | null }> | null;
  gymConfig: { owner_email: string | null; billing_mode: string | null } | null;
}

/** Spec: "Miembros elegibles para cobro". */
export function filtrarElegibles(input: ElegiblesInput, hoy: Date): ElegiblesResult {
  const miembros = (input.perfiles || []).filter(
    (m) => m.activo !== false && (m.activo as unknown) !== 0 && String(m.activo).toLowerCase() !== "false"
  );
  const miembrosLibresIds = new Set(
    (input.membresias || [])
      .filter((l) => {
        if (!l.start_date) return true;
        return new Date(l.start_date) <= hoy;
      })
      .map((l) => l.user_id)
  );
  const fechaInicioMap = new Map<string, string>();
  for (const l of input.membresias || []) {
    if (l.start_date) fechaInicioMap.set(l.user_id, l.start_date);
  }
  const ownerEmail = input.gymConfig?.owner_email?.toLowerCase() || "";
  const modoCobro = (input.gymConfig?.billing_mode as ModoCobro) || "dia_uno";
  const montoMensual = input.metodoPago?.amount_monthly || 0;
  const montoInscripcion = input.metodoPago?.amount_inscription || 0;

  return {
    miembros,
    miembrosLibresIds,
    fechaInicioMap,
    ownerEmail,
    modoCobro,
    montoMensual,
    montoInscripcion,
  };
}
