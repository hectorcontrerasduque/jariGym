import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { MetodoPago, ModoCobro } from "./types";

/** Prioridad para elegir el método "principal" cuando hay varios activos. */
const PRIORIDAD_METODO: MetodoPago[] = ["efectivo", "bs", "binance"];

/**
 * Elige el método de pago principal entre los activos: efectivo > bs > binance.
 * Se usa para los cálculos de deuda (montos en USD), de modo que con varios
 * métodos activos la cifra no cambie respecto de cuando solo estaba efectivo.
 * Devuelve null si la lista está vacía.
 */
export function metodoPrincipal<T extends { payment_method?: MetodoPago }>(metodos: T[]): T | null {
  if (metodos.length === 0) return null;
  const prioridad = (m: T) => {
    const i = PRIORIDAD_METODO.indexOf(m.payment_method as MetodoPago);
    return i === -1 ? PRIORIDAD_METODO.length : i;
  };
  let mejor = metodos[0];
  for (const m of metodos) {
    if (prioridad(m) < prioridad(mejor)) mejor = m;
  }
  return mejor;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function parseLocalDate(date: string | Date): Date {
  if (typeof date === "string") {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(+match[1], +match[2] - 1, +match[3]);
  }
  return new Date(date);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseLocalDate(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseLocalDate(date));
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

  const dia = parseInt(fechaInscripcion.split("-")[2], 10);
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


