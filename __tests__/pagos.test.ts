import { describe, it, expect } from "vitest";
import type { Pago, MetodoPago, CreatePagoInput } from "@/lib/types";
import { getMonthName, formatCurrency } from "@/lib/utils";

function createMockPago(overrides: Partial<Pago> = {}): Pago {
  return {
    id: "test-pago-id",
    usuario_id: "test-user-id",
    monto: 25.0,
    comprobante_url: null,
    estado: "pendiente",
    metodo_pago: "efectivo",
    codigo_billete: null,
    notas: null,
    approved_by: null,
    approved_at: null,
    fecha_pago_real: null,
    mes_pagar: 8,
    anio_pagar: 2026,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Pago type", () => {
  it("should have required fields", () => {
    const pago = createMockPago();
    expect(pago.id).toBeDefined();
    expect(pago.usuario_id).toBeDefined();
    expect(pago.monto).toBeTypeOf("number");
    expect(pago.estado).toBeDefined();
    expect(pago.metodo_pago).toBeDefined();
    expect(pago.mes_pagar).toBeTypeOf("number");
    expect(pago.anio_pagar).toBeTypeOf("number");
  });

  it("should not have membresia_id", () => {
    const pago = createMockPago();
    expect(pago).not.toHaveProperty("membresia_id");
  });

  it("should not have membresia relation", () => {
    const pago = createMockPago();
    expect(pago).not.toHaveProperty("membresia");
  });

  it("should support all payment statuses", () => {
    const pendiente = createMockPago({ estado: "pendiente" });
    const aprobado = createMockPago({ estado: "aprobado" });
    const rechazado = createMockPago({ estado: "rechazado" });

    expect(pendiente.estado).toBe("pendiente");
    expect(aprobado.estado).toBe("aprobado");
    expect(rechazado.estado).toBe("rechazado");
  });

  it("should support all payment methods", () => {
    const efectivo = createMockPago({ metodo_pago: "efectivo" });
    const bs = createMockPago({ metodo_pago: "bs" });
    const binance = createMockPago({ metodo_pago: "binance" });
    const transferencia = createMockPago({ metodo_pago: "transferencia" });
    const libre = createMockPago({ metodo_pago: "membresia_libre" });

    expect(efectivo.metodo_pago).toBe("efectivo");
    expect(bs.metodo_pago).toBe("bs");
    expect(binance.metodo_pago).toBe("binance");
    expect(transferencia.metodo_pago).toBe("transferencia");
    expect(libre.metodo_pago).toBe("membresia_libre");
  });

  it("should have nullable optional fields", () => {
    const pago = createMockPago({
      comprobante_url: null,
      codigo_billete: null,
      notas: null,
      approved_by: null,
      approved_at: null,
      fecha_pago_real: null,
    });

    expect(pago.comprobante_url).toBeNull();
    expect(pago.codigo_billete).toBeNull();
    expect(pago.notas).toBeNull();
    expect(pago.approved_by).toBeNull();
    expect(pago.approved_at).toBeNull();
    expect(pago.fecha_pago_real).toBeNull();
  });

  it("should default estado to pendiente", () => {
    const pago = createMockPago();
    expect(pago.estado).toBe("pendiente");
  });
});

describe("Pago label helpers", () => {
  function getPagoLabel(pago: Pago): string {
    const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
    if (isInscripcion) return "Inscripción";
    return `${getMonthName(pago.mes_pagar)} ${pago.anio_pagar}`;
  }

  it("should return Inscripción for inscripcion pagos", () => {
    const pago = createMockPago({ notas: "Inscripción - pago inicial" });
    expect(getPagoLabel(pago)).toBe("Inscripción");
  });

  it("should return Inscripción for inscripcion with accent", () => {
    const pago = createMockPago({ notas: "INSCRIPCIÓN" });
    expect(getPagoLabel(pago)).toBe("Inscripción");
  });

  it("should return month name for mensualidad pagos", () => {
    const pago = createMockPago({ mes_pagar: 3, anio_pagar: 2026, notas: null });
    expect(getPagoLabel(pago)).toBe("Marzo 2026");
  });

  it("should return month name for pagos with other notes", () => {
    const pago = createMockPago({ mes_pagar: 12, anio_pagar: 2025, notas: "Pago regular" });
    expect(getPagoLabel(pago)).toBe("Diciembre 2025");
  });
});

describe("Pago creation input", () => {
  it("should accept all required fields", () => {
    const input: CreatePagoInput = {
      usuario_id: "user-123",
      monto: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      metodo_pago: "efectivo",
    };

    expect(input.usuario_id).toBe("user-123");
    expect(input.monto).toBe(30);
    expect(input.metodo_pago).toBe("efectivo");
  });

  it("should accept optional fields", () => {
    const input: CreatePagoInput = {
      usuario_id: "user-123",
      monto: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      metodo_pago: "bs",
      comprobante_url: "https://example.com/comprobante.jpg",
      codigo_billete: "ABC12",
      notas: "Pago de agosto",
      fecha_pago_real: "2026-08-15",
    };

    expect(input.comprobante_url).toBe("https://example.com/comprobante.jpg");
    expect(input.codigo_billete).toBe("ABC12");
    expect(input.fecha_pago_real).toBe("2026-08-15");
  });

  it("should require fecha_pago_real as optional string", () => {
    const inputWithDate: CreatePagoInput = {
      usuario_id: "user-123",
      monto: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      metodo_pago: "efectivo",
      fecha_pago_real: "2026-08-15",
    };

    const inputWithoutDate: CreatePagoInput = {
      usuario_id: "user-123",
      monto: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      metodo_pago: "efectivo",
    };

    expect(inputWithDate.fecha_pago_real).toBe("2026-08-15");
    expect(inputWithoutDate.fecha_pago_real).toBeUndefined();
  });
});

describe("Payment utility functions", () => {
  it("formatCurrency should format USD by default", () => {
    expect(formatCurrency(25)).toBe("$25.00");
  });

  it("formatCurrency should format with decimals", () => {
    expect(formatCurrency(25.5)).toBe("$25.50");
  });

  it("formatCurrency should format zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("getMonthName should return correct month names", () => {
    expect(getMonthName(1)).toBe("Enero");
    expect(getMonthName(6)).toBe("Junio");
    expect(getMonthName(12)).toBe("Diciembre");
  });

  it("getMonthName should return empty for invalid month", () => {
    expect(getMonthName(0)).toBe("");
    expect(getMonthName(13)).toBe("");
  });
});
