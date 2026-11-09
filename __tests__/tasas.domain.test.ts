import { describe, it, expect } from "vitest";
import {
  normalizarTasa,
  necesitaActualizar,
  recortarAUltimas,
  HORAS_VIGENCIA,
  LIMITE_TASAS,
  type TasaFila,
} from "@/lib/features/tasas/domain";

const HOY = new Date("2026-11-09T12:00:00.000Z");

describe("normalizarTasa", () => {
  it("acepta el payload real del proveedor", () => {
    const r = normalizarTasa({
      moneda: "USD",
      fuente: "oficial",
      promedio: 897.5383,
      fechaActualizacion: "2026-11-09T00:00:00-04:00",
    });
    expect(r).toEqual({
      effectiveAt: "2026-11-09T04:00:00.000Z",
      rateBs: 897.5383,
    });
  });

  it("acepta promedio como string numerico", () => {
    const r = normalizarTasa({ promedio: "900.25", fechaActualizacion: "2026-11-09T00:00:00-04:00" });
    expect(r).toEqual({ effectiveAt: "2026-11-09T04:00:00.000Z", rateBs: 900.25 });
  });

  it("rechaza montos no positivos", () => {
    const fecha = "2026-11-09T00:00:00-04:00";
    expect(normalizarTasa({ promedio: 0, fechaActualizacion: fecha })).toBeNull();
    expect(normalizarTasa({ promedio: -5, fechaActualizacion: fecha })).toBeNull();
    expect(normalizarTasa({ promedio: null, fechaActualizacion: fecha })).toBeNull();
    expect(normalizarTasa({ promedio: NaN, fechaActualizacion: fecha })).toBeNull();
    expect(normalizarTasa({ promedio: "abc", fechaActualizacion: fecha })).toBeNull();
  });

  it("rechaza fechas ausentes o invalidas", () => {
    expect(normalizarTasa({ promedio: 900 })).toBeNull();
    expect(normalizarTasa({ promedio: 900, fechaActualizacion: "no-es-fecha" })).toBeNull();
    expect(normalizarTasa({ promedio: 900, fechaActualizacion: 42 })).toBeNull();
  });

  it("rechaza payloads que no son objetos", () => {
    expect(normalizarTasa(null)).toBeNull();
    expect(normalizarTasa(undefined)).toBeNull();
    expect(normalizarTasa("900")).toBeNull();
    expect(normalizarTasa(900)).toBeNull();
  });
});

describe("necesitaActualizar", () => {
  it("sin registro previo siempre necesita", () => {
    expect(necesitaActualizar(null, HOY)).toBe(true);
    expect(necesitaActualizar(undefined, HOY)).toBe(true);
    expect(necesitaActualizar("", HOY)).toBe(true);
  });

  it("fecha ilegible siempre necesita", () => {
    expect(necesitaActualizar("no-es-fecha", HOY)).toBe(true);
  });

  it("vigencia fresca (< 6 h) no necesita", () => {
    const unaHoraAtras = new Date(HOY.getTime() - 3600_000).toISOString();
    expect(necesitaActualizar(unaHoraAtras, HOY)).toBe(false);
  });

  it("en el borde de las 6 h exactas ya necesita", () => {
    const hace6h = new Date(HOY.getTime() - HORAS_VIGENCIA * 3600_000).toISOString();
    expect(necesitaActualizar(hace6h, HOY)).toBe(true);
  });

  it("vigencia vieja (> 6 h) necesita", () => {
    const hace7h = new Date(HOY.getTime() - 7 * 3600_000).toISOString();
    expect(necesitaActualizar(hace7h, HOY)).toBe(true);
  });
});

function fila(id: number, effective_at: string, created_at?: string): TasaFila {
  return { id, effective_at, rate_bs: 900, source: "dolarapi", created_at };
}

describe("recortarAUltimas", () => {
  it("se queda con las 10 mas recientes de 15", () => {
    const tasas = Array.from({ length: 15 }, (_, i) =>
      fila(i + 1, new Date(Date.UTC(2026, 10, 1 + i)).toISOString())
    );
    const resultado = recortarAUltimas(tasas);
    expect(resultado).toHaveLength(LIMITE_TASAS);
    expect(resultado[0].id).toBe(15);
    expect(resultado[LIMITE_TASAS - 1].id).toBe(6);
  });

  it("no recorta si hay menos del limite", () => {
    const tres = [fila(1, "2026-11-03T00:00:00Z"), fila(2, "2026-11-02T00:00:00Z"), fila(3, "2026-11-01T00:00:00Z")];
    expect(recortarAUltimas(tres)).toHaveLength(3);
  });

  it("ordena por vigencia descendente", () => {
    const resultado = recortarAUltimas([
      fila(1, "2026-11-01T00:00:00Z"),
      fila(2, "2026-11-03T00:00:00Z"),
      fila(3, "2026-11-02T00:00:00Z"),
    ]);
    expect(resultado.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("desempata por created_at descendente cuando la vigencia empata", () => {
    const vig = "2026-11-09T00:00:00Z";
    const resultado = recortarAUltimas([
      fila(1, vig, "2026-11-09T10:00:00Z"),
      fila(2, vig, "2026-11-09T12:00:00Z"),
      fila(3, vig, "2026-11-09T11:00:00Z"),
    ]);
    expect(resultado.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("no muta la entrada", () => {
    const entrada = [fila(1, "2026-11-01T00:00:00Z"), fila(2, "2026-11-02T00:00:00Z")];
    const copia = [...entrada];
    recortarAUltimas(entrada);
    expect(entrada).toEqual(copia);
  });
});
