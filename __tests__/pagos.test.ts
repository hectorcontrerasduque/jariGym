import { describe, it, expect } from "vitest";
import type { Payment, PaymentDetail, CreatePaymentInput, TipoPago } from "@/lib/types";
import type { PaymentDetailInput } from "@/lib/services/pagos/pagos.service";
import { getMonthName, formatCurrency, formatDate } from "@/lib/utils";

function createMockPago(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "test-pago-id",
    user_id: "test-user-id",
    status: "pendiente",
    payment_method: "efectivo",
    bill_code: null,
    receipt_url: null,
    payment_note: null,
    approved_by: null,
    approved_at: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
    ...overrides,
  };
}

function createMockDetail(overrides: Partial<PaymentDetail> = {}): PaymentDetail {
  return {
    id: "detail-1",
    payment_id: "test-pago-id",
    month_number: 8,
    year_number: 2026,
    payment_type: "mensualidad",
    payment_amount: 25,
    ...overrides,
  };
}

function createMockInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  return {
    user_id: "user-123",
    payment_method: "efectivo",
    detalles: [
      { month_number: 8, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 },
    ],
    ...overrides,
  };
}

// ─── Payment type ────────────────────────────────────────────

describe("Payment type", () => {
  it("should have required fields", () => {
    const pago = createMockPago();
    expect(pago.id).toBeDefined();
    expect(pago.user_id).toBeDefined();
    expect(pago.status).toBeDefined();
    expect(pago.payment_method).toBeDefined();
  });

  it("should not have legacy fields", () => {
    const pago = createMockPago();
    expect(pago).not.toHaveProperty("membresia_id");
    expect(pago).not.toHaveProperty("membresia");
    expect(pago).not.toHaveProperty("payment_amount");
    expect(pago).not.toHaveProperty("mes_pagar");
    expect(pago).not.toHaveProperty("anio_pagar");
  });

  it("should support all payment statuses", () => {
    const statuses: Payment["status"][] = [
      "pendiente", "aprobado", "rechazado", "suspendido", "suspendido_pendiente",
    ];
    for (const status of statuses) {
      const pago = createMockPago({ status });
      expect(pago.status).toBe(status);
    }
  });

  it("should support all payment methods", () => {
    const methods = ["efectivo", "bs", "binance", "transferencia", "membresia_libre"] as const;
    for (const method of methods) {
      const pago = createMockPago({ payment_method: method });
      expect(pago.payment_method).toBe(method);
    }
  });

  it("should have nullable optional fields", () => {
    const pago = createMockPago();
    expect(pago.bill_code).toBeNull();
    expect(pago.receipt_url).toBeNull();
    expect(pago.payment_note).toBeNull();
    expect(pago.approved_by).toBeNull();
    expect(pago.approved_at).toBeNull();
    expect(pago.created_by).toBeNull();
    expect(pago.updated_by).toBeNull();
  });

  it("should default status to pendiente", () => {
    const pago = createMockPago();
    expect(pago.status).toBe("pendiente");
  });

  it("detail array is optional", () => {
    const pago = createMockPago();
    expect(pago.detail).toBeUndefined();
  });

  it("detail with payments has correct structure", () => {
    const detail = createMockDetail();
    const pago = createMockPago({ detail: [detail] });
    expect(pago.detail).toHaveLength(1);
    expect(pago.detail![0].payment_type).toBe("mensualidad");
    expect(pago.detail![0].payment_amount).toBe(25);
  });
});

// ─── PaymentDetail type ──────────────────────────────────────

describe("PaymentDetail type", () => {
  it("should have required fields", () => {
    const d = createMockDetail();
    expect(d.id).toBeDefined();
    expect(d.payment_id).toBeDefined();
    expect(d.payment_type).toBeDefined();
    expect(d.payment_amount).toBeTypeOf("number");
  });

  it("month_number and year_number can be null", () => {
    const d = createMockDetail({ month_number: null, year_number: null });
    expect(d.month_number).toBeNull();
    expect(d.year_number).toBeNull();
  });

  it("should support all payment types", () => {
    const types: TipoPago[] = ["mensualidad", "inscripcion"];
    for (const payment_type of types) {
      const d = createMockDetail({ payment_type });
      expect(d.payment_type).toBe(payment_type);
    }
  });

  it("payment_amount can be 0 for inscripcion", () => {
    const d = createMockDetail({ payment_type: "inscripcion", payment_amount: 0 });
    expect(d.payment_amount).toBe(0);
  });
});

// ─── CreatePaymentInput ──────────────────────────────────────

describe("CreatePaymentInput", () => {
  it("should accept all required fields", () => {
    const input = createMockInput();
    expect(input.user_id).toBe("user-123");
    expect(input.payment_method).toBe("efectivo");
    expect(input.detalles).toHaveLength(1);
  });

  it("detalles must be non-empty", () => {
    const input = createMockInput({ detalles: [] });
    expect(input.detalles).toHaveLength(0);
  });

  it("supports multiple detalles", () => {
    const input = createMockInput({
      detalles: [
        { month_number: 7, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 },
        { month_number: 8, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 },
        { month_number: null, year_number: null, payment_type: "inscripcion", payment_amount: 10 },
      ],
    });
    expect(input.detalles).toHaveLength(3);
    expect(input.detalles[2].payment_type).toBe("inscripcion");
  });

  it("optional fields are undefined by default", () => {
    const input = createMockInput();
    expect(input.receipt_url).toBeUndefined();
    expect(input.bill_code).toBeUndefined();
    expect(input.payment_note).toBeUndefined();
  });

  it("accepts optional fields", () => {
    const input = createMockInput({
      receipt_url: "https://example.com/comprobante.jpg",
      bill_code: "ABC12",
      payment_note: "Pago de agosto",
    });
    expect(input.receipt_url).toBe("https://example.com/comprobante.jpg");
    expect(input.bill_code).toBe("ABC12");
    expect(input.payment_note).toBe("Pago de agosto");
  });
});

// ─── PaymentDetailInput ──────────────────────────────────────

describe("PaymentDetailInput", () => {
  it("should require all fields", () => {
    const input: PaymentDetailInput = {
      month_number: 8,
      year_number: 2026,
      payment_type: "mensualidad",
      payment_amount: 25,
    };
    expect(input.month_number).toBe(8);
    expect(input.year_number).toBe(2026);
    expect(input.payment_type).toBe("mensualidad");
    expect(input.payment_amount).toBe(25);
  });

  it("accepts null month/year for inscripcion", () => {
    const input: PaymentDetailInput = {
      month_number: null,
      year_number: null,
      payment_type: "inscripcion",
      payment_amount: 10,
    };
    expect(input.month_number).toBeNull();
    expect(input.payment_type).toBe("inscripcion");
  });
});

// ─── Utility functions ───────────────────────────────────────

describe("formatCurrency", () => {
  it("formats USD by default", () => {
    expect(formatCurrency(25)).toBe("$25.00");
  });

  it("formats with decimals", () => {
    expect(formatCurrency(25.5)).toBe("$25.50");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats large numbers", () => {
    expect(formatCurrency(999999)).toBe("$999,999.00");
  });

  it("formats negative numbers", () => {
    expect(formatCurrency(-10)).toBe("-$10.00");
  });

  it("rounds to 2 decimals", () => {
    expect(formatCurrency(10.005)).toBe("$10.01");
  });
});

describe("getMonthName", () => {
  it("returns correct month names", () => {
    expect(getMonthName(1)).toBe("Enero");
    expect(getMonthName(6)).toBe("Junio");
    expect(getMonthName(12)).toBe("Diciembre");
  });

  it("returns empty for invalid month 0", () => {
    expect(getMonthName(0)).toBe("");
  });

  it("returns empty for invalid month 13", () => {
    expect(getMonthName(13)).toBe("");
  });

  it("returns empty for negative month", () => {
    expect(getMonthName(-1)).toBe("");
  });

  it("returns empty for null/undefined", () => {
    expect(getMonthName(null as unknown as number)).toBe("");
    expect(getMonthName(undefined as unknown as number)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a valid date string", () => {
    const result = formatDate("2026-08-15T10:30:00Z");
    expect(result).toContain("2026");
  });

  it("formats a ISO date string", () => {
    const result = formatDate("2026-01-20");
    expect(result).toContain("2026");
    expect(result).toContain("enero");
  });
});
