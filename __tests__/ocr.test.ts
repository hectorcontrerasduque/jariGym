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
  it("toma el monto de la línea con etiqueta 'Monto'", () => {
    const texto = "Pago recibido\nReferencia: 001234\nMonto: 1.500.000,00 Bs";
    expect(extraerMonto(texto)).toBe(1_500_000);
  });

  it("ignora códigos pequeños (referencias)", () => {
    const texto = "Ref 001234\nMonto Bs 250000";
    expect(extraerMonto(texto)).toBe(250_000);
  });

  it("devuelve 0 si no hay etiqueta de monto ni Bs", () => {
    expect(extraerMonto("sin montos aquí")).toBe(0);
  });

  it("prefiere el número con Bs sobre un código más largo", () => {
    const texto = "Nro. de operación: 2026031512345678\nMonto: 1.500.000,00 Bs";
    expect(extraerMonto(texto)).toBe(1_500_000);
  });

  it("nunca toma el número de operación como monto", () => {
    const texto = "Banco emisor: BDV\nNro. de operación: 0012345678\nImporte: 2.000.000,00 Bs";
    expect(extraerMonto(texto)).toBe(2_000_000);
  });

  it("acepta el monto con Bs antepuesto", () => {
    expect(extraerMonto("Operación: 9999999999\nTotal Bs 1.250.000,50")).toBe(1_250_000.5);
  });

  it("no confunde el número de destino con el monto", () => {
    const texto = "Destino: 01340123456789012345\nMonto: 1.500.000,00 Bs";
    expect(extraerMonto(texto)).toBe(1_500_000);
  });

  it("sin monto identificable devuelve 0 (no adivina con el número más grande)", () => {
    expect(extraerMonto("Cuenta destino: 01340123456789012345")).toBe(0);
    expect(extraerMonto("Destino: 01340123456789012345")).toBe(0);
  });

  it("acepta el monto etiquetado aunque no lleve Bs", () => {
    expect(extraerMonto("Nro. de operación: 0012345678\nMonto: 1.500.000,00")).toBe(1_500_000);
    expect(extraerMonto("Monto total: 1.500.000,00 Bs")).toBe(1_500_000);
  });

  it("la etiqueta 'Monto' gana sobre otro número con Bs", () => {
    const texto = "Saldo: 5.000.000,00 Bs\nMonto: 1.500.000,00 Bs";
    expect(extraerMonto(texto)).toBe(1_500_000);
  });
});

describe("ocr — extraerBanco", () => {
  it("detecta bancos venezolanos conocidos", () => {
    expect(extraerBanco("BANCO MERCANTIL\nComprobante")).toBe("Mercantil");
    expect(extraerBanco("Banesco Universal")).toBe("Banesco");
    expect(extraerBanco("BANCO PROVINCIAL")).toBe("BBVA Provincial");
  });

  it("devuelve vacío si no reconoce el banco", () => {
    expect(extraerBanco("Transferencia desconocida")).toBe("");
  });

  it("prioriza el banco emisor sobre el destino", () => {
    const texto = "Banco destino: 0134 Mercantil\nBanco emisor: 0102 Banco de Venezuela";
    expect(extraerBanco(texto)).toBe("Banco de Venezuela");
  });

  it("reconoce la sigla BDV como Banco de Venezuela", () => {
    expect(extraerBanco("Banco destino: Banesco\nBanco emisor: BDV")).toBe("Banco de Venezuela");
  });

  it("soporta la etiqueta de emisor con el valor en la línea siguiente", () => {
    expect(extraerBanco("Banco emisor\n0102 Banco de Venezuela")).toBe("Banco de Venezuela");
  });

  it("sin etiqueta de emisor usa el primer banco del texto", () => {
    expect(extraerBanco("Banco de Venezuela\nBanco destino: Mercantil")).toBe("Banco de Venezuela");
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

  it("reconoce variantes de 'Nro. de operación'", () => {
    expect(extraerReferencia("Nro. de operación: 0012345678")).toBe("0012345678");
    expect(extraerReferencia("Nro de operacion 0012345678")).toBe("0012345678");
    expect(extraerReferencia("N° de operación: 0012345678")).toBe("0012345678");
    expect(extraerReferencia("Número de la operación: 0012345678")).toBe("0012345678");
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

  it("parsea un comprobante de pago móvil BDV (destino ≠ emisor)", () => {
    const recibo = `
      COMPROBANTE DE PAGO MÓVIL
      Banco destino: 0134 Mercantil
      Cédula/RIF destino: V-12345678
      Banco emisor: 0102 Banco de Venezuela
      Cédula/RIF emisor: V-87654321
      Monto: 1.500.000,00 Bs
      Nro. de operación: 0012345678
      Fecha: 15/03/2026
    `;
    const datos = extraerDatos(recibo);
    expect(datos.amount_bs).toBe(1_500_000);
    expect(datos.bank).toBe("Banco de Venezuela");
    expect(datos.reference_number).toBe("0012345678");
  });
});
