import { describe, it, expect } from "vitest";
import {
  convertirBsABsd,
  repartirUsdEntreDetalles,
  estaCubierto,
  paymentListoParaAprobar,
  restanteUsd,
  type DetalleInput,
} from "@/lib/features/pagos/domain/bolivares";

describe("domain/bolivares — convertirBsABsd", () => {
  it("convierte Bs → USD con 2 decimales", () => {
    expect(convertirBsABsd(1_500_000, 100)).toBe(15_000);
    expect(convertirBsABsd(150_000, 36.5)).toBeCloseTo(4109.59, 2);
  });

  it("lanza si la tasa no es > 0", () => {
    expect(() => convertirBsABsd(1000, 0)).toThrow();
    expect(() => convertirBsABsd(1000, -5)).toThrow();
  });

  it("lanza si el monto no es > 0", () => {
    expect(() => convertirBsABsd(0, 100)).toThrow();
  });
});

describe("domain/bolivares — repartirUsdEntreDetalles", () => {
  const base: DetalleInput[] = [
    { month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 },
    { month_number: 2, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 },
  ];

  it("reparte proporcional al peso esperado", () => {
    const r = repartirUsdEntreDetalles(50, base, 100);
    expect(r).toHaveLength(2);
    expect(r[0].amount_usd).toBe(25);
    expect(r[1].amount_usd).toBe(25);
    expect(r[0].amount_bs).toBe(2500);
    expect(r[1].amount_bs).toBe(2500);
  });

  it("el residuo de redondeo va al último detalle (suma exacta)", () => {
    const r = repartirUsdEntreDetalles(10, base, 40); // 10 USD no divisible en 3 partes iguales
    const sumaUsd = r.reduce((s, x) => s + x.amount_usd, 0);
    expect(Math.round(sumaUsd * 100)).toBe(1000);
  });

  it("reparte en partes iguales si todos los esperados son 0", () => {
    const ceros: DetalleInput[] = [
      { month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 0 },
      { month_number: 2, year_number: 2026, payment_type: "mensualidad", payment_amount: 0 },
      { month_number: 3, year_number: 2026, payment_type: "mensualidad", payment_amount: 0 },
    ];
    const r = repartirUsdEntreDetalles(30, ceros, 100);
    expect(r.map((x) => x.amount_usd)).toEqual([10, 10, 10]);
  });

  it("lanza si no hay detalles o montos inválidos", () => {
    expect(() => repartirUsdEntreDetalles(10, [], 100)).toThrow();
    expect(() => repartirUsdEntreDetalles(0, base, 100)).toThrow();
    expect(() => repartirUsdEntreDetalles(10, base, 0)).toThrow();
  });

  it("reparte inscripción + mensualidad con pesos distintos", () => {
    const mix: DetalleInput[] = [
      { month_number: 1, year_number: 2026, payment_type: "inscripcion", payment_amount: 10 },
      { month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 20 },
    ];
    const r = repartirUsdEntreDetalles(30, mix, 50);
    expect(r[0].amount_usd).toBe(10);
    expect(r[1].amount_usd).toBe(20);
  });
});

describe("domain/bolivares — cobertura (reconciled ≠ aprobado)", () => {
  it("cubierto cuando la suma reconciliada >= monto esperado", () => {
    expect(estaCubierto({ montoEsperadoUsd: 25, sumaReconciliadaUsd: 25 })).toBe(true);
    expect(estaCubierto({ montoEsperadoUsd: 25, sumaReconciliadaUsd: 30 })).toBe(true);
    expect(estaCubierto({ montoEsperadoUsd: 25, sumaReconciliadaUsd: 24.99 })).toBe(false);
  });

  it("monto 0 (suspensión) siempre cubierto", () => {
    expect(estaCubierto({ montoEsperadoUsd: 0, sumaReconciliadaUsd: 0 })).toBe(true);
  });

  it("pago parcial: suma insuficiente NO está cubierto", () => {
    // Ej: mensualidad 25 USD, miembro pagó 10 USD en Bs y concilió → sigue debiendo
    expect(estaCubierto({ montoEsperadoUsd: 25, sumaReconciliadaUsd: 10 })).toBe(false);
    expect(restanteUsd({ montoEsperadoUsd: 25, sumaReconciliadaUsd: 10 })).toBe(15);
  });

  it("restanteUsd devuelve 0 si ya cubierto", () => {
    expect(restanteUsd({ montoEsperadoUsd: 25, sumaReconciliadaUsd: 30 })).toBe(0);
  });

  it("paymentListoParaAprobar solo si TODOS los detalles están cubiertos", () => {
    const ok = [
      { month_number: 1, year_number: 2026, payment_type: "mensualidad" as const, montoEsperadoUsd: 25, sumaReconciliadaUsd: 25 },
      { month_number: 2, year_number: 2026, payment_type: "mensualidad" as const, montoEsperadoUsd: 25, sumaReconciliadaUsd: 25 },
    ];
    expect(paymentListoParaAprobar(ok)).toBe(true);

    const parcial = [
      { month_number: 1, year_number: 2026, payment_type: "mensualidad" as const, montoEsperadoUsd: 25, sumaReconciliadaUsd: 25 },
      { month_number: 2, year_number: 2026, payment_type: "mensualidad" as const, montoEsperadoUsd: 25, sumaReconciliadaUsd: 10 },
    ];
    expect(paymentListoParaAprobar(parcial)).toBe(false);
    expect(paymentListoParaAprobar([])).toBe(false);
  });
});
