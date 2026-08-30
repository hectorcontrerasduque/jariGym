import { describe, it, expect } from "vitest";
import type { Payment, CreatePagoInput } from "@/lib/types";
import { getMonthName, formatCurrency } from "@/lib/utils";

function createMockPago(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "test-pago-id",
    user_id: "test-user-id",
    payment_amount: 25.0,
    receipt_url: null,
    status: "pendiente",
    payment_method: "efectivo",
    bill_code: null,
    payment_note: null,
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
    expect(pago.user_id).toBeDefined();
    expect(pago.payment_amount).toBeTypeOf("number");
    expect(pago.status).toBeDefined();
    expect(pago.payment_method).toBeDefined();
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
    const suspendido = createMockPago({ estado: "suspendido" });
    const suspendidoPendiente = createMockPago({ estado: "suspendido_pendiente" });

    expect(pendiente.estado).toBe("pendiente");
    expect(aprobado.estado).toBe("aprobado");
    expect(rechazado.estado).toBe("rechazado");
    expect(suspendido.estado).toBe("suspendido");
    expect(suspendidoPendiente.estado).toBe("suspendido_pendiente");
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
      receipt_url: null,
      bill_code: null,
      payment_note: null,
      approved_by: null,
      approved_at: null,
    });

    expect(pago.receipt_url).toBeNull();
    expect(pago.bill_code).toBeNull();
    expect(pago.payment_note).toBeNull();
    expect(pago.approved_by).toBeNull();
    expect(pago.approved_at).toBeNull();
  });

  it("should support tipo_pago field", () => {
    const membresia = createMockPago({ tipo_pago: "membresia" });
    const inscripcion = createMockPago({ tipo_pago: "inscripcion" });
    expect(membresia.tipo_pago).toBe("membresia");
    expect(inscripcion.tipo_pago).toBe("inscripcion");
  });

  it("should default estado to pendiente", () => {
    const pago = createMockPago();
    expect(pago.status).toBe("pendiente");
  });
});

describe("Pago label helpers", () => {
  function getPagoLabel(pago: Payment): string {
    const isInscripcion = pago.payment_note?.toLowerCase().includes("inscripción") || pago.payment_note?.toLowerCase().includes("inscripcion");
    if (isInscripcion) return "Inscripción";
    return `${getMonthName(pago.mes_pagar)} ${pago.anio_pagar}`;
  }

  it("should return Inscripción for inscripcion pagos", () => {
    const pago = createMockPago({ payment_note: "Inscripción - pago inicial" });
    expect(getPagoLabel(pago)).toBe("Inscripción");
  });

  it("should return Inscripción for inscripcion with accent", () => {
    const pago = createMockPago({ payment_note: "INSCRIPCIÓN" });
    expect(getPagoLabel(pago)).toBe("Inscripción");
  });

  it("should return month name for mensualidad pagos", () => {
    const pago = createMockPago({ mes_pagar: 3, anio_pagar: 2026, payment_note: null });
    expect(getPagoLabel(pago)).toBe("Marzo 2026");
  });

  it("should return month name for pagos with other notes", () => {
    const pago = createMockPago({ mes_pagar: 12, anio_pagar: 2025, payment_note: "Pago regular" });
    expect(getPagoLabel(pago)).toBe("Diciembre 2025");
  });
});

describe("Pago creation input", () => {
  it("should accept all required fields", () => {
    const input: CreatePagoInput = {
      user_id: "user-123",
      payment_amount: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      payment_method: "efectivo",
    };

    expect(input.user_id).toBe("user-123");
    expect(input.payment_amount).toBe(30);
    expect(input.payment_method).toBe("efectivo");
  });

  it("should accept optional fields", () => {
    const input: CreatePagoInput = {
      user_id: "user-123",
      payment_amount: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      payment_method: "bs",
      receipt_url: "https://example.com/comprobante.jpg",
      bill_code: "ABC12",
      payment_note: "Pago de agosto",
    };

    expect(input.receipt_url).toBe("https://example.com/comprobante.jpg");
    expect(input.bill_code).toBe("ABC12");
  });

  it("should require payment_note as optional string", () => {
    const inputWithNote: CreatePagoInput = {
      user_id: "user-123",
      payment_amount: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      payment_method: "efectivo",
      payment_note: "Pago de agosto",
    };

    const inputWithoutNote: CreatePagoInput = {
      user_id: "user-123",
      payment_amount: 30,
      mes_pagar: 8,
      anio_pagar: 2026,
      payment_method: "efectivo",
    };

    expect(inputWithNote.payment_note).toBe("Pago de agosto");
    expect(inputWithoutNote.payment_note).toBeUndefined();
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
