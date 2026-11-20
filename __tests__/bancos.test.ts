import { describe, it, expect } from "vitest";
import {
  bancosEnTexto,
  buscarBancos,
  canonicalizarBanco,
} from "@/lib/features/pagos/domain/bancos";

describe("canonicalizarBanco", () => {
  it("normaliza siglas y variantes al nombre canónico", () => {
    expect(canonicalizarBanco("bdv")).toBe("Banco de Venezuela");
    expect(canonicalizarBanco("BDV")).toBe("Banco de Venezuela");
    expect(canonicalizarBanco("banco venezuela")).toBe("Banco de Venezuela");
    expect(canonicalizarBanco("Bco Venezuela")).toBe("Banco de Venezuela");
    expect(canonicalizarBanco("BANCO DE VENEZUELA")).toBe("Banco de Venezuela");
  });

  it("normaliza acentos y mayúsculas", () => {
    expect(canonicalizarBanco("banco caroni")).toBe("Banco Caroní");
    expect(canonicalizarBanco("BANCO CARONÍ")).toBe("Banco Caroní");
    expect(canonicalizarBanco("venezolano de credito")).toBe("Venezolano de Crédito");
  });

  it("mapea variantes del Provincial a BBVA Provincial", () => {
    expect(canonicalizarBanco("provincial")).toBe("BBVA Provincial");
    expect(canonicalizarBanco("banco provincial")).toBe("BBVA Provincial");
    expect(canonicalizarBanco("bbva")).toBe("BBVA Provincial");
  });

  it("rechaza texto inventado o parcial", () => {
    expect(canonicalizarBanco("bco venezla")).toBeNull();
    expect(canonicalizarBanco("mer")).toBeNull();
    expect(canonicalizarBanco("")).toBeNull();
    expect(canonicalizarBanco("banco inventado")).toBeNull();
  });
});

describe("buscarBancos", () => {
  it("filtra por nombre o alias", () => {
    expect(buscarBancos("bdv")).toEqual(["Banco de Venezuela"]);
    expect(buscarBancos("merc")).toEqual(["Mercantil"]);
    expect(buscarBancos("bbva")).toEqual(["BBVA Provincial"]);
  });

  it("sin consulta devuelve el catálogo completo", () => {
    expect(buscarBancos("").length).toBeGreaterThan(10);
  });

  it("sin coincidencias devuelve []", () => {
    expect(buscarBancos("zzzz")).toEqual([]);
  });
});

describe("bancosEnTexto (OCR)", () => {
  it("devuelve el banco mencionado y su posición", () => {
    expect(bancosEnTexto("Banco destino: 0134 Mercantil")[0]).toEqual({
      nombre: "Mercantil",
      indice: expect.any(Number),
    });
  });

  it("ordena por posición en el texto", () => {
    const encontrados = bancosEnTexto("Banco de Venezuela\nBanco destino: Mercantil");
    expect(encontrados.map((b) => b.nombre)).toEqual(["Banco de Venezuela", "Mercantil"]);
  });

  it("reconoce siglas", () => {
    expect(bancosEnTexto("Banco emisor: BDV")[0]?.nombre).toBe("Banco de Venezuela");
  });
});
