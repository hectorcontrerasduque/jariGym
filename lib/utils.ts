import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ModoCobro } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function getMonthName(month: number) {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return months[month - 1] || "";
}

export function getMonthShort(month: number) {
  const months = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  return months[month - 1] || "";
}

export function getDiaCobro(
  fechaInscripcion: string,
  mes: number,
  anio: number,
  modoCobro: ModoCobro = "dia_uno"
): number {
  if (modoCobro === "dia_uno") return 1;

  const dia = new Date(fechaInscripcion).getDate();
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  return Math.min(dia, ultimoDiaMes);
}

export function getDiaNotificacion(
  diaCobro: number,
  diasPrevio: number,
  mes: number,
  anio: number
): { dia: number; mes: number; anio: number } {
  let resultado = diaCobro - diasPrevio;
  let mesNotif = mes;
  let anioNotif = anio;

  while (resultado < 1) {
    mesNotif--;
    if (mesNotif < 1) {
      mesNotif = 12;
      anioNotif--;
    }
    const ultimoDiaMesAnterior = new Date(anioNotif, mesNotif, 0).getDate();
    resultado = ultimoDiaMesAnterior + resultado;
  }

  return { dia: resultado, mes: mesNotif, anio: anioNotif };
}

export function esDiaDeNotificacion(
  fechaInscripcion: string,
  diasPrevio: number,
  fechaActual: Date = new Date()
): boolean {
  const mesActual = fechaActual.getMonth() + 1;
  const anioActual = fechaActual.getFullYear();
  const diaActual = fechaActual.getDate();

  const diaCobro = getDiaCobro(fechaInscripcion, mesActual, anioActual);
  const notif = getDiaNotificacion(diaCobro, diasPrevio, mesActual, anioActual);

  return diaActual === notif.dia &&
    fechaActual.getMonth() + 1 === notif.mes &&
    fechaActual.getFullYear() === notif.anio;
}

export function esMoroso(
  fechaInscripcion: string,
  mesesCubiertos: Set<number>,
  mesActual: number,
  anioActual: number,
  fechaActual: Date = new Date()
): boolean {
  const diaInscripcion = new Date(fechaInscripcion).getDate();
  const parts = fechaInscripcion.split("-").map(Number);
  const anioInicio = parts[0];
  const mesInicio = parts[1];

  let mesDeuda = mesInicio + 1;
  let anioDeuda = anioInicio;
  if (mesDeuda > 12) {
    mesDeuda = 1;
    anioDeuda = anioInicio + 1;
  }

  if (anioDeuda > anioActual) return false;
  const primerMesDeuda = anioDeuda === anioActual ? mesDeuda : 1;

  for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
    if (mesesCubiertos.has(mes)) continue;

    const diaCobro = Math.min(diaInscripcion, new Date(anioActual, mes, 0).getDate());

    if (mes === mesActual && fechaActual.getDate() < diaCobro) continue;

    return true;
  }

  return false;
}
