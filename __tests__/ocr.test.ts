import { describe, it, expect } from "vitest";
import {
  extraerDatos,
  extraerMonto,
  extraerBanco,
  extraerReferencia,
  parseNumero,
} from "@/lib/features/pagos/ocr";

describe("ocr — parseNumero (separadores latinos/anglos)", () => {
  it("acepta formato latino (punto miles, coma decimal)", () => {
    expect(parseNumero("1.500.000,00")).toBe(1_500_000);
    expect(parseNumero("1.500.000")).toBe(1_500_000);
    expect(parseNumero("25,50")).toBe(25.5);
  });

  it("acepta formato anglo (coma miles, punto decimal)", () => {
    expect(parseNumero("1,500,000.00")).toBe(1_500_000);
    expect(parseNumero("1,500,000")).toBe(1_500_000);
  });

  it("acepta números simples", () => {
    expect(parseNumero("1500000")).toBe(1_500_000);
    expect(parseNumero("0")).toBe(0);
    expect(parseNumero("")).toBe(0);
    expect(parseNumero("abc")).toBe(0);
  });
});

describe("ocr — extraerMonto", () => {
  it("toma el importe más grande >= 100 del recibo", () => {
    const texto = "Pago recibido\nReferencia: 001234\nMonto: 1.500.000,00 Bs";
    expect(extraerMonto(texto)).toBe(1_500_000);
  });

  it("ignora códigos pequeños (referencias)", () => {
    const texto = "Ref 001234\nMonto Bs 250000";
    expect(extraerMonto(texto)).toBe(250_000);
  });

  it("devuelve 0 si no hay candidatos", () => {
    expect(extraerMonto("sin montos aquí")).toBe(0);
  });
});

describe("ocr — extraerBanco", () => {
  it("detecta bancos venezolanos conocidos", () => {
    expect(extraerBanco("BANCO MERCANTIL\nComprobante")).toBe("Mercantil");
    expect(extraerBanco("Banesco Universal")).toBe("Banesco");
    expect(extraerBanco("BANCO PROVINCIAL")).toBe("Provincial");
  });

  it("devuelve vacío si no reconoce el banco", () => {
    expect(extraerBanco("Transferencia desconocida")).toBe("");
  });
});

describe("ocr — extraerReferencia", () => {
  it("extrae el número tras una etiqueta típica", () => {
    expect(extraerReferencia("Referencia: 00987654")).toBe("00987654");
    expect(extraerReferencia("Nro. Operación # ABC12345")).toBe("ABC12345");
    expect(extraerReferencia("Código de operación: 555888")).toBe("555888");
  });

  it("devuelve vacío sin etiqueta (no adivina)", () => {
    expect(extraerReferencia("solo texto libre 12345")).toBe("");
  });
});

describe("ocr — extraerDatos (integración)", () => {
  it("parsea un recibo completo", () => {
    const recibo = `
      BANCO MERCANTIL
      Pago a Gimnasio Fitness
      Monto: 1.500.000,00 Bs
      Referencia: 00112233
    `;
    const datos = extraerDatos(recibo);
    expect(datos.amount_bs).toBe(1_500_000);
    expect(datos.bank).toBe("Mercantil");
    expect(datos.reference_number).toBe("00112233");
  });

  it("no lanza con texto vacío", () => {
    const datos = extraerDatos("");
    expect(datos.amount_bs).toBe(0);
    expect(datos.bank).toBe("");
    expect(datos.reference_number).toBe("");
  });
});
