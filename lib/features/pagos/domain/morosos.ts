import { getDiaCobro } from "@/lib/utils";
import type { ElegiblesResult, Moroso, PagoRPCRow } from "./types";

/**
 * Members whose inscription is paid: an approved `inscripcion` line in the year's
 * payments, or `inscription_paid` on the profile.
 */
export function miembrosConInscripcionPagada(
  miembros: ElegiblesResult["miembros"],
  pagosDelAnio: Pick<PagoRPCRow, "status" | "payment_type" | "user_id">[]
): Set<string> {
  const ids = new Set<string>();
  for (const pago of pagosDelAnio) {
    if (pago.status === "aprobado" && pago.payment_type === "inscripcion") ids.add(pago.user_id);
  }
  for (const m of miembros) {
    if (m.inscription_paid) ids.add(m.id);
  }
  return ids;
}

/** Spec: "Cálculo de miembros morosos". */
export function calcularMorosos(
  elegibles: ElegiblesResult,
  pagosDelAnio: PagoRPCRow[],
  anio: number,
  hoy: Date
): Moroso[] {
  const mesActual = anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
  const { miembros, miembrosLibresIds, fechaInicioMap, ownerEmail, modoCobro, montoMensual, montoInscripcion } = elegibles;

  if (miembros.length === 0) return [];

  const pagosAprobados = pagosDelAnio.filter((p) => p.status === "aprobado");
  const conInscripcion = miembrosConInscripcionPagada(miembros, pagosDelAnio);

  const morosos: Moroso[] = [];

  for (const miembro of miembros) {
    if (miembrosLibresIds.has(miembro.id)) continue;
    if (miembro.email?.toLowerCase() === ownerEmail) continue;

    const debeInscripcion = !conInscripcion.has(miembro.id);

    const fechaInicioMembresia = fechaInicioMap.get(miembro.id);
    const fechaInscripcion = miembro.start_date;

    let fechaInicioStr = fechaInicioMembresia || fechaInscripcion;
    if (fechaInicioMembresia) {
      const membershipStart = new Date(fechaInicioMembresia);
      if (membershipStart > hoy) {
        fechaInicioStr = fechaInscripcion;
        if (!fechaInicioStr) continue;
      }
    }

    let primerMesDeuda = 1;
    if (fechaInicioStr) {
      const parts = fechaInicioStr.split("-").map(Number);
      const anioInicio = parts[0];
      const mesInicio = parts[1];

      if (anioInicio > anio) continue;
      if (anioInicio === anio) {
        primerMesDeuda = mesInicio;
      }
    }

    const mesesCubiertos = new Set(
      pagosAprobados.filter((p) => p.user_id === miembro.id).map((p) => p.month_number)
    );

    const mesesDeuda: number[] = [];
    for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
      if (mesesCubiertos.has(mes)) continue;

      const diaCobro = getDiaCobro(fechaInicioStr || "2000-01-01", mes, anio, modoCobro);

      if (mes === mesActual && hoy.getDate() < diaCobro) continue;

      mesesDeuda.push(mes);
    }

    const pagosPendientesMiembro = pagosDelAnio.filter(
      (p) => p.user_id === miembro.id && p.year_number === anio &&
        p.payment_type === "mensualidad" && p.status === "pendiente"
    );
    const montoPendiente = pagosPendientesMiembro.reduce((sum, p) => sum + (p.payment_amount || montoMensual), 0);

    if (!debeInscripcion && mesesDeuda.length === 0 && pagosPendientesMiembro.length === 0) continue;

    const deudas = mesesDeuda.map((mes) => ({
      month_number: mes,
      year_number: anio,
      payment_amount: montoMensual,
    }));

    const totalDeuda = mesesDeuda.length * montoMensual + (debeInscripcion ? montoInscripcion : 0);

    morosos.push({
      id: miembro.id,
      email: miembro.email!,
      full_name: miembro.full_name || "",
      deudas,
      totalDeuda,
      debeInscripcion,
      mesesDeuda,
      pagosPendientes: pagosPendientesMiembro.length,
      montoPendiente,
    });
  }

  return morosos;
}

/**
 * Spec: "Miembros al día". Eligible members (not owner, not libre) whose id is in
 * `userIdsConPagoDelMes` (users with an approved mensualidad/suspension for the month).
 */
export function calcularMiembrosAlDia(elegibles: ElegiblesResult, userIdsConPagoDelMes: Iterable<string>): string[] {
  const { miembros, ownerEmail, miembrosLibresIds } = elegibles;
  const idsAlDia = new Set(userIdsConPagoDelMes);
  return miembros
    .filter((m) => m.email?.toLowerCase() !== ownerEmail && !miembrosLibresIds.has(m.id))
    .filter((m) => idsAlDia.has(m.id))
    .map((m) => m.id);
}
