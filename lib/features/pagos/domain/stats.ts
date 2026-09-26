import { getMonthName } from "@/lib/utils";
import { miembrosConInscripcionPagada } from "./morosos";
import type { ElegiblesResult, Moroso, PagoRPCRow } from "./types";

export interface StatsAnuales {
  totalMiembros: number;
  miembrosActivos: number;
  inscritosPagados: number;
  inscritosPendientes: number;
  deudoresTotal: number;
  deudoresInscripcion: number;
  deudoresMensualidad: number;
  alDiaMensualidad: number;
  montoDeuda: number;
  montoDeudaInscripcion: number;
  montoDeudaMensualidad: number;
  montoPagado: number;
  membresiaLibre: number;
  pagosConfirmados: number;
  pagosPendientes: number;
  ingresosMes: number;
}

export interface StatsMes {
  month_number: number;
  year_number: number;
  nombre: string;
  pagados: number;
  pendientes: number;
  sinPago: number;
  libres: number;
  montoAcumulado: number;
  montoAdeudado: number;
  montoPendiente: number;
}

export interface StatsMensuales {
  totalMiembros: number;
  libres: number;
  meses: StatsMes[];
}

/**
 * Spec: "Estadísticas anuales del dashboard".
 * @param morosos result of calcularMorosos for the same year and elegibles
 */
export function calcularStats(
  elegibles: ElegiblesResult,
  pagosDelAnio: PagoRPCRow[],
  morosos: Moroso[],
  anio: number,
  hoy: Date
): StatsAnuales {
  const mesActual = hoy.getMonth() + 1;
  const { miembros: allMiembros, miembrosLibresIds, ownerEmail, montoMensual, montoInscripcion } = elegibles;

  const miembrosActivos = allMiembros.filter((m) => m.email?.toLowerCase() !== ownerEmail);

  const todosPagosAprobados = pagosDelAnio.filter((p) => p.status === "aprobado");
  const conInscripcion = miembrosConInscripcionPagada(allMiembros, pagosDelAnio);

  const inscritosPagados = miembrosActivos.filter((m) => conInscripcion.has(m.id)).length;
  const inscritosPendientes = miembrosActivos.filter((m) => !conInscripcion.has(m.id)).length;

  const deudoresInscripcion = morosos.filter((m) => m.debeInscripcion).length;
  const deudoresMensualidad = morosos.filter((m) => m.mesesDeuda.length > 0).length;
  const montoDeudaInscripcion = deudoresInscripcion * montoInscripcion;
  const montoDeudaMensualidad = morosos.reduce((sum, m) => sum + m.mesesDeuda.length, 0) * montoMensual;
  const montoDeuda = montoDeudaInscripcion + montoDeudaMensualidad;

  const pagosMesActual = pagosDelAnio.filter(
    (p) => p.status === "aprobado" && p.month_number === mesActual && p.year_number === anio && (p.payment_type === "mensualidad" || p.payment_type === "suspension")
  );
  const usuariosAlDia = new Set(
    pagosMesActual.filter((p) => conInscripcion.has(p.user_id)).map((p) => p.user_id)
  );
  const alDiaMensualidad = usuariosAlDia.size;
  const montoPagado = pagosMesActual
    .filter((p) => usuariosAlDia.has(p.user_id))
    .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

  return {
    totalMiembros: miembrosActivos.length,
    miembrosActivos: miembrosActivos.length,
    inscritosPagados,
    inscritosPendientes,
    deudoresTotal: morosos.length,
    deudoresInscripcion,
    deudoresMensualidad,
    alDiaMensualidad,
    montoDeuda,
    montoDeudaInscripcion,
    montoDeudaMensualidad,
    montoPagado,
    membresiaLibre: miembrosLibresIds.size,
    pagosConfirmados: todosPagosAprobados.length,
    pagosPendientes: pagosDelAnio.filter((p) => p.status === "pendiente").length,
    ingresosMes: montoPagado,
  };
}

/** Spec: "Estadísticas mensuales del dashboard". */
export function calcularMonthlyStats(
  elegibles: ElegiblesResult,
  pagosDelAnio: PagoRPCRow[],
  anio: number,
  hoy: Date
): StatsMensuales {
  const mesMaximo = anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
  const { miembros: allProfiles, miembrosLibresIds, ownerEmail, montoMensual } = elegibles;

  const profiles = allProfiles.filter((p) => p.email?.toLowerCase() !== ownerEmail);

  const meses: StatsMes[] = [];
  for (let mes = 1; mes <= mesMaximo; mes++) {
    const finMes = new Date(anio, mes, 0);
    const miembrosMes = profiles.filter((p) => {
      const fechaInsc = p.start_date ? new Date(p.start_date) : null;
      return !(fechaInsc && fechaInsc > finMes);
    });
    const idsMes = new Set(miembrosMes.map((p) => p.id));

    const pagosMes = pagosDelAnio.filter((p) => p.month_number === mes && p.year_number === anio);

    const pagados = new Set(
      pagosMes.filter((p) => p.status === "aprobado" && idsMes.has(p.user_id)).map((p) => p.user_id)
    ).size;

    const pendientes = new Set(
      pagosMes.filter((p) => p.status === "pendiente" && idsMes.has(p.user_id)).map((p) => p.user_id)
    ).size;

    const montoAcumulado = pagosMes
      .filter((p) => p.status === "aprobado")
      .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

    const montoPendiente = pagosMes
      .filter((p) => p.status === "pendiente")
      .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

    const sinPago = Math.max(0, miembrosMes.length - pagados - pendientes);

    meses.push({
      month_number: mes,
      year_number: anio,
      nombre: getMonthName(mes),
      pagados,
      pendientes,
      sinPago,
      libres: 0,
      montoAcumulado,
      montoAdeudado: sinPago * montoMensual,
      montoPendiente,
    });
  }

  return { totalMiembros: profiles.length, libres: miembrosLibresIds.size, meses };
}
