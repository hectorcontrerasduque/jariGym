import { describe, it, expect } from "vitest";
import { getDiaCobro, getDiaNotificacion, esDiaDeNotificacion } from "@/lib/utils";

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