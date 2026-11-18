import { describe, it, expect } from "vitest";
import {
  dedupeMetodos,
  metodosActivos,
  primeraActivacionPorMetodo,
  metodoPorDefecto,
} from "@/lib/features/pagos/domain/metodos";
import type { MetodoPago, PaymentMethod } from "@/lib/types";

function fila(
  payment_method: MetodoPago,
  overrides: Partial<PaymentMethod> = {}
): PaymentMethod {
  return {
    id: `${payment_method}-${overrides.created_at ?? "x"}`,
    payment_method,
    amount_monthly: 10,
    amount_inscription: 5,
    is_active: true,
    effective_from: "2026-01-01",
    effective_to: null,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("dedupeMetodos", () => {
  it("elige la fila vigente (created_at mayor) por método", () => {
    const vieja = fila("efectivo", { id: "old", is_active: false, created_at: "2026-01-01T00:00:00+00:00" });
    const nueva = fila("efectivo", { id: "new", is_active: true, created_at: "2026-02-01T00:00:00+00:00" });
    expect(dedupeMetodos([vieja, nueva]).map((m) => m.id)).toEqual(["new"]);
    expect(dedupeMetodos([nueva, vieja]).map((m) => m.id)).toEqual(["new"]);
  });

  it("devuelve en orden canónico efectivo > bs > binance", () => {
    const filas = [fila("binance"), fila("bs"), fila("efectivo")];
    expect(dedupeMetodos(filas).map((m) => m.payment_method)).toEqual([
      "efectivo",
      "bs",
      "binance",
    ]);
  });

  it("con created_at empatado prefiere la activa", () => {
    const inactiva = fila("bs", { id: "inactiva", is_active: false });
    const activa = fila("bs", { id: "activa", is_active: true });
    expect(dedupeMetodos([inactiva, activa]).map((m) => m.id)).toEqual(["activa"]);
  });

  it("lista nula o vacía -> []", () => {
    expect(dedupeMetodos(null)).toEqual([]);
    expect(dedupeMetodos(undefined)).toEqual([]);
    expect(dedupeMetodos([])).toEqual([]);
  });
});

describe("metodosActivos", () => {
  it("solo los vigentes habilitados", () => {
    const filas = [
      fila("efectivo", { is_active: true }),
      fila("bs", { is_active: false }),
      fila("binance", { is_active: true }),
    ];
    expect(metodosActivos(filas).map((m) => m.payment_method)).toEqual(["efectivo", "binance"]);
  });

  it("si la fila vigente está inactiva, no reaparece una vieja activa", () => {
    const viejaActiva = fila("bs", { id: "old", is_active: true, created_at: "2026-01-01T00:00:00+00:00" });
    const nuevaInactiva = fila("bs", { id: "new", is_active: false, created_at: "2026-02-01T00:00:00+00:00" });
    expect(metodosActivos([viejaActiva, nuevaInactiva])).toEqual([]);
  });
});

describe("primeraActivacionPorMetodo", () => {
  it("toma el created_at mínimo histórico por método", () => {
    const filas = [
      fila("efectivo", { created_at: "2026-03-01T00:00:00+00:00" }),
      fila("efectivo", { created_at: "2026-01-01T00:00:00+00:00" }),
      fila("bs", { created_at: "2026-02-01T00:00:00+00:00" }),
    ];
    const primera = primeraActivacionPorMetodo(filas);
    expect(primera.get("efectivo")).toBe(Date.parse("2026-01-01T00:00:00+00:00"));
    expect(primera.get("bs")).toBe(Date.parse("2026-02-01T00:00:00+00:00"));
  });

  it("ignora fechas inválidas", () => {
    const primera = primeraActivacionPorMetodo([fila("bs", { created_at: "" })]);
    expect(primera.has("bs")).toBe(false);
  });
});

describe("metodoPorDefecto", () => {
  it("sin activos -> null", () => {
    expect(metodoPorDefecto([], null)).toBeNull();
    expect(metodoPorDefecto([fila("bs", { is_active: false })], null)).toBeNull();
  });

  it("la elección guardada gana si sigue activa", () => {
    const filas = [
      fila("efectivo", { created_at: "2026-01-01T00:00:00+00:00" }),
      fila("bs", { created_at: "2026-02-01T00:00:00+00:00" }),
    ];
    expect(metodoPorDefecto(filas, "bs")).toBe("bs");
  });

  it("si la elección guardada ya no está activa, cae al más antiguo", () => {
    const filas = [
      fila("efectivo", { created_at: "2026-01-01T00:00:00+00:00" }),
      fila("bs", { is_active: false, created_at: "2025-01-01T00:00:00+00:00" }),
    ];
    expect(metodoPorDefecto(filas, "bs")).toBe("efectivo");
  });

  it("sin elección guardada devuelve el activado primero en el tiempo", () => {
    const filas = [
      fila("efectivo", { created_at: "2026-02-01T00:00:00+00:00" }),
      fila("bs", { created_at: "2026-01-01T00:00:00+00:00" }),
    ];
    expect(metodoPorDefecto(filas, null)).toBe("bs");
  });

  it("desempata por orden canónico cuando la primera activación es igual", () => {
    const filas = [fila("binance"), fila("bs"), fila("efectivo")];
    expect(metodoPorDefecto(filas, null)).toBe("efectivo");
  });
});
