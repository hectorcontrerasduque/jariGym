import { getDiaCobro } from "@/lib/utils";
import {
  coberturasPorUsuario,
  deudaPorMetodo,
  filasCoberturaDesdePagos,
  indexarGrupos,
} from "./cobertura";
import type { ElegiblesResult, EstadoCobertura, Moroso, PagoRPCRow } from "./types";

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

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Spec: "Cálculo de miembros morosos" — ahora parcial-aware.
 *
 * Un mes es deuda si su cobertura aprobada es < 1 (fracción pendiente × precio).
 * La deuda se calcula por método (`deudaPorMetodo`) y `totalDeuda` queda como
 * referencia al precio del método principal (parcial-aware).
 */
export function calcularMorosos(
  elegibles: ElegiblesResult,
  pagosDelAnio: PagoRPCRow[],
  anio: number,
  hoy: Date
): Moroso[] {
  const mesActual = anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
  const { miembros, miembrosLibresIds, fechaInicioMap, ownerEmail, modoCobro, montoMensual, montoInscripcion, preciosPorMetodo } =
    elegibles;

  if (miembros.length === 0) return [];

  const coberturas = coberturasPorUsuario(filasCoberturaDesdePagos(pagosDelAnio), preciosPorMetodo);

  const morosos: Moroso[] = [];

  for (const miembro of miembros) {
    if (miembrosLibresIds.has(miembro.id)) continue;
    if (miembro.email?.toLowerCase() === ownerEmail) continue;

    const { mensualidad, suspensiones, inscripcion } = indexarGrupos(
      coberturas.get(miembro.id) ?? []
    );

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

    const mesesDeuda: number[] = [];
    const deudas: Moroso["deudas"] = [];
    const conceptosMeses: EstadoCobertura[] = [];

    for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
      const key = `${mes}-${anio}`;
      if (suspensiones.has(key)) continue;

      const grupo = mensualidad.get(key);
      const fraccion = grupo?.fraccionPagada ?? 0;
      if (fraccion >= 1 - 1e-9) continue;

      const diaCobro = getDiaCobro(fechaInicioStr || "2000-01-01", mes, anio, modoCobro);
      if (mes === mesActual && hoy.getDate() < diaCobro) continue;

      const pendiente = Math.max(0, 1 - fraccion);
      mesesDeuda.push(mes);
      deudas.push({
        month_number: mes,
        year_number: anio,
        payment_amount: redondear2(pendiente * montoMensual),
      });
      conceptosMeses.push({
        fraccionPagada: fraccion,
        fraccionPendiente: pendiente,
        porcentaje: Math.min(100, Math.round(fraccion * 100)),
        montoPagado: grupo?.montoPagado ?? 0,
        preciosPorMetodo: grupo?.preciosPorMetodo ?? {},
        metodoPago: grupo?.metodoPago ?? null,
      });
    }

    const fraccionInscripcion = miembro.inscription_paid
      ? 1
      : (inscripcion?.fraccionPagada ?? 0);
    const debeInscripcion = fraccionInscripcion < 1 - 1e-9;

    const conceptoInscripcion: EstadoCobertura | null = debeInscripcion
      ? {
          fraccionPagada: fraccionInscripcion,
          fraccionPendiente: Math.max(0, 1 - fraccionInscripcion),
          porcentaje: Math.min(100, Math.round(fraccionInscripcion * 100)),
          montoPagado: inscripcion?.montoPagado ?? 0,
          preciosPorMetodo: inscripcion?.preciosPorMetodo ?? {},
          metodoPago: inscripcion?.metodoPago ?? null,
        }
      : null;

    const deudaPorMetodoMiembro = deudaPorMetodo(
      conceptosMeses,
      conceptoInscripcion,
      preciosPorMetodo
    );

    const pagosPendientesMiembro = pagosDelAnio.filter(
      (p) =>
        p.user_id === miembro.id &&
        p.year_number === anio &&
        p.payment_type === "mensualidad" &&
        p.status === "pendiente"
    );
    const montoPendiente = pagosPendientesMiembro.reduce(
      (sum, p) => sum + (p.payment_amount || montoMensual),
      0
    );

    if (!debeInscripcion && mesesDeuda.length === 0 && pagosPendientesMiembro.length === 0) continue;

    const totalInscripcion = conceptoInscripcion
      ? redondear2(conceptoInscripcion.fraccionPendiente * montoInscripcion)
      : 0;
    const totalMeses = redondear2(deudas.reduce((sum, d) => sum + d.payment_amount, 0));

    morosos.push({
      id: miembro.id,
      email: miembro.email!,
      full_name: miembro.full_name || "",
      deudas,
      totalDeuda: redondear2(totalMeses + totalInscripcion),
      deudaPorMetodo: deudaPorMetodoMiembro,
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
