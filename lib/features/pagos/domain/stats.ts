import { getMonthName } from "@/lib/utils";
import {
  coberturasPorUsuario,
  deudaPorMetodo,
  filasCoberturaDesdePagos,
  indexarGrupos,
  type CoberturaGrupo,
} from "./cobertura";
import type { DeudaMetodo, ElegiblesResult, EstadoCobertura, Moroso, PagoRPCRow } from "./types";

export interface StatsAnuales {
  totalMiembros: number;
  miembrosActivos: number;
  inscritosPagados: number;
  inscritosPendientes: number;
  deudoresTotal: number;
  deudoresInscripcion: number;
  deudoresMensualidad: number;
  alDiaMensualidad: number;
  parcialesMensualidad: number;
  /** Deuda desglosada por método activo (parcial-aware). */
  deudaPorMetodo: DeudaMetodo[];
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
  /** Miembros con cobertura parcial (0 < fracción < 1). */
  parciales: number;
  pendientes: number;
  sinPago: number;
  libres: number;
  montoAcumulado: number;
  montoAdeudado: number;
  /** Adeudado desglosado por método activo. */
  adeudadoPorMetodo: DeudaMetodo[];
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
  const { miembros: allMiembros, miembrosLibresIds, ownerEmail, preciosPorMetodo } = elegibles;

  const miembrosActivos = allMiembros.filter((m) => m.email?.toLowerCase() !== ownerEmail);

  const todosPagosAprobados = pagosDelAnio.filter((p) => p.status === "aprobado");
  const coberturas = coberturasPorUsuario(filasCoberturaDesdePagos(pagosDelAnio), preciosPorMetodo);
  const gruposDe = (userId: string) => indexarGrupos(coberturas.get(userId) ?? []);

  const inscritosPagados = miembrosActivos.filter((m) =>
    inscripcionCubierta(m.inscription_paid, gruposDe(m.id).inscripcion)
  ).length;
  const inscritosPendientes = miembrosActivos.length - inscritosPagados;

  const deudoresInscripcion = morosos.filter((m) => m.debeInscripcion).length;
  const deudoresMensualidad = morosos.filter((m) => m.mesesDeuda.length > 0).length;

  const montoDeudaMensualidad = redondear2(
    morosos.reduce((sum, m) => sum + m.deudas.reduce((x, d) => x + d.payment_amount, 0), 0)
  );
  const montoDeuda = redondear2(morosos.reduce((sum, m) => sum + m.totalDeuda, 0));
  const montoDeudaInscripcion = redondear2(Math.max(0, montoDeuda - montoDeudaMensualidad));

  // Deuda por método: suma de la deuda de cada moroso por método activo.
  const acumuladoPorMetodo = new Map<string, number>();
  for (const moroso of morosos) {
    for (const deuda of moroso.deudaPorMetodo) {
      acumuladoPorMetodo.set(
        deuda.metodo,
        (acumuladoPorMetodo.get(deuda.metodo) ?? 0) + deuda.totalUsd
      );
    }
  }
  const deudaPorMetodoTotal: DeudaMetodo[] = Object.keys(preciosPorMetodo ?? {}).map((metodo) => ({
    metodo,
    totalUsd: redondear2(acumuladoPorMetodo.get(metodo) ?? 0),
  }));

  // Al día / parciales del mes actual (cobertura aprobada, exige inscripción cubierta).
  const keyMesActual = `${mesActual}-${anio}`;
  const usuariosAlDia = new Set<string>();
  let alDiaMensualidad = 0;
  let parcialesMensualidad = 0;

  for (const miembro of miembrosActivos) {
    const idx = gruposDe(miembro.id);
    if (!inscripcionCubierta(miembro.inscription_paid, idx.inscripcion)) continue;

    const fraccion = idx.suspensiones.has(keyMesActual)
      ? 1
      : (idx.mensualidad.get(keyMesActual)?.fraccionPagada ?? 0);

    if (fraccion >= 1 - 1e-9) {
      alDiaMensualidad++;
      usuariosAlDia.add(miembro.id);
    } else if (fraccion > 0) {
      parcialesMensualidad++;
    }
  }

  const pagosMesActual = pagosDelAnio.filter(
    (p) =>
      p.status === "aprobado" &&
      p.month_number === mesActual &&
      p.year_number === anio &&
      (p.payment_type === "mensualidad" || p.payment_type === "suspension")
  );
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
    parcialesMensualidad,
    deudaPorMetodo: deudaPorMetodoTotal,
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

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function inscripcionCubierta(profileFlag: boolean, grupo: CoberturaGrupo | null): boolean {
  return profileFlag || (grupo?.fraccionPagada ?? 0) >= 1 - 1e-9;
}

function conceptoDeGrupo(grupo: CoberturaGrupo): EstadoCobertura {
  return {
    fraccionPagada: grupo.fraccionPagada,
    fraccionPendiente: grupo.fraccionPendiente,
    porcentaje: grupo.porcentaje,
    montoPagado: grupo.montoPagado,
    preciosPorMetodo: grupo.preciosPorMetodo,
    metodoPago: grupo.metodoPago,
  };
}

function conceptoSinPago(): EstadoCobertura {
  return {
    fraccionPagada: 0,
    fraccionPendiente: 1,
    porcentaje: 0,
    montoPagado: 0,
    preciosPorMetodo: {},
    metodoPago: null,
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
  const { miembros: allProfiles, miembrosLibresIds, ownerEmail, montoMensual, preciosPorMetodo } = elegibles;

  const profiles = allProfiles.filter((p) => p.email?.toLowerCase() !== ownerEmail);
  const coberturas = coberturasPorUsuario(filasCoberturaDesdePagos(pagosDelAnio), preciosPorMetodo);

  const meses: StatsMes[] = [];
  for (let mes = 1; mes <= mesMaximo; mes++) {
    const finMes = new Date(anio, mes, 0);
    const miembrosMes = profiles.filter((p) => {
      const fechaInsc = p.start_date ? new Date(p.start_date) : null;
      return !(fechaInsc && fechaInsc > finMes);
    });

    const pagosMes = pagosDelAnio.filter((p) => p.month_number === mes && p.year_number === anio);
    const key = `${mes}-${anio}`;

    let pagados = 0;
    let parciales = 0;
    let pendientes = 0;
    let sinPago = 0;
    let montoAdeudado = 0;
    const conceptos: EstadoCobertura[] = [];

    for (const miembro of miembrosMes) {
      const idx = indexarGrupos(coberturas.get(miembro.id) ?? []);

      if (idx.suspensiones.has(key)) {
        pagados++;
        continue;
      }

      const grupo = idx.mensualidad.get(key);
      const fraccion = grupo?.fraccionPagada ?? 0;

      if (fraccion >= 1 - 1e-9) {
        pagados++;
      } else if (fraccion > 0) {
        parciales++;
        const concepto = conceptoDeGrupo(grupo!);
        conceptos.push(concepto);
        montoAdeudado += concepto.fraccionPendiente * montoMensual;
      } else if (grupo?.tienePendiente) {
        pendientes++;
      } else {
        sinPago++;
        conceptos.push(conceptoSinPago());
        montoAdeudado += montoMensual;
      }
    }

    const montoAcumulado = pagosMes
      .filter((p) => p.status === "aprobado")
      .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

    const montoPendiente = pagosMes
      .filter((p) => p.status === "pendiente")
      .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

    meses.push({
      month_number: mes,
      year_number: anio,
      nombre: getMonthName(mes),
      pagados,
      parciales,
      pendientes,
      sinPago,
      libres: 0,
      montoAcumulado,
      montoAdeudado: redondear2(montoAdeudado),
      adeudadoPorMetodo: deudaPorMetodo(conceptos, null, preciosPorMetodo),
      montoPendiente,
    });
  }

  return { totalMiembros: profiles.length, libres: miembrosLibresIds.size, meses };
}
