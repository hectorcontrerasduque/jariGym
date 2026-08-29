import { describe, it, expect } from "vitest";
import { getDiaCobro, getDiaNotificacion, esMoroso, esDiaDeNotificacion } from "@/lib/utils";

describe("getDiaCobro", () => {
  it("modo dia_uno siempre retorna 1", () => {
    expect(getDiaCobro("2024-01-15", 5, 2024, "dia_uno")).toBe(1);
  });
  it("modo fecha_inscripcion respeta día original si existe en mes", () => {
    // Use UTC-safe date format to avoid timezone issues
    expect(getDiaCobro("2024-01-15T12:00:00Z", 5, 2024, "fecha_inscripcion")).toBe(15);
  });
  it("ajusta mes corto (febrero)", () => {
    expect(getDiaCobro("2024-01-31T12:00:00Z", 2, 2024, "fecha_inscripcion")).toBe(29);
    expect(getDiaCobro("2024-01-31T12:00:00Z", 2, 2025, "fecha_inscripcion")).toBe(28);
  });
});

describe("getDiaNotificacion", () => {
  it("calcula día anterior correctamente", () => {
    expect(getDiaNotificacion(15, 3, 5, 2024)).toEqual({ dia: 12, mes: 5, anio: 2024 });
  });
  it("envuelve a mes anterior si día < 1", () => {
    expect(getDiaNotificacion(2, 5, 5, 2024)).toEqual({ dia: 27, mes: 4, anio: 2024 });
  });
  it("envuelve a año anterior en enero", () => {
    expect(getDiaNotificacion(2, 5, 1, 2024)).toEqual({ dia: 28, mes: 12, anio: 2023 });
  });
});

describe("esMoroso", () => {
  it("respeta grace period 30 días", () => {
    const covered = new Set<number>();
    expect(esMoroso("2024-11-15T12:00:00Z", covered, 11, 2024, new Date("2024-11-30T12:00:00Z"))).toBe(false);
  });
  it("moroso después de 30 días sin pagos (dia_inscripcion=1 => diaCobro=1)", () => {
    const covered = new Set<number>();
    // Inscrito 1 oct, hoy 15 nov. diaInscripcion=1 => diaCobro=1. mesActual=11, hoy=15 >= 1 -> moroso
    expect(esMoroso("2024-10-01T12:00:00Z", covered, 11, 2024, new Date("2024-11-15T12:00:00Z"))).toBe(true);
  });
  it("no moroso si mes cubierto por pago", () => {
    const covered = new Set([11]);
    expect(esMoroso("2024-10-01T12:00:00Z", covered, 11, 2024, new Date("2024-11-15T12:00:00Z"))).toBe(false);
  });
  it("no moroso si hoy < diaCobro en mes actual (fecha_inscripcion día 15)", () => {
    const covered = new Set<number>();
    // fecha_inscripcion día 15 -> diaCobro=15. hoy=10 < 15 -> no moroso
    expect(esMoroso("2024-10-15T12:00:00Z", covered, 11, 2024, new Date("2024-11-10T12:00:00Z"))).toBe(false);
  });
});

describe("esDiaDeNotificacion", () => {
  it("coincide en día de pago con diasPrevio=0 (modo dia_uno)", () => {
    // modo default "dia_uno": diaCobro=1, diasPrevio=0 -> notif = 1 (mismo mes)
    // fechaActual = 1 sep 2023 -> coincide con notif para sep
    expect(esDiaDeNotificacion("2024-01-15T12:00:00Z", 0, new Date("2023-09-01T12:00:00Z"))).toBe(true);
  });
  it("no coincide día anterior", () => {
    expect(esDiaDeNotificacion("2024-01-15T12:00:00Z", 0, new Date("2023-08-31T12:00:00Z"))).toBe(false);
  });
});