import { describe, it, expect } from "vitest";
import {
  calcularCoberturaGrupos,
  calcularCoberturaTipo,
  deudaPorMetodo,
  distribuirSecuencial,
  pendienteUsd,
  preciosDesdeMetodos,
  type FilaCobertura,
  type PreciosPorMetodo,
} from "@/lib/features/pagos/domain/cobertura";
import type { MesConCobertura } from "@/lib/features/pagos/domain/types";

function fila(overrides: Partial<FilaCobertura> = {}): FilaCobertura {
  return {
    month_number: 11,
    year_number: 2026,
    payment_type: "mensualidad",
    payment_amount: 0,
    expected_amount_usd: null,
    status: "aprobado",
    payment_method: "bs",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const precios: PreciosPorMetodo = {
  efectivo: { mensual: 30, inscripcion: 50 },
  bs: { mensual: 35, inscripcion: 50 },
};

function grupo(detalles: FilaCobertura[], tipo = "mensualidad") {
  const grupo = calcularCoberturaGrupos(detalles, precios).find((g) => g.payment_type === tipo);
  if (!grupo) throw new Error("grupo no encontrado");
  return grupo;
}

describe("cobertura — prorated por método", () => {
  it("Bs $25 (35) + efectivo $10 (30) cubre el mes (104%)", () => {
    const g = grupo([
      fila({ payment_amount: 25, expected_amount_usd: 35, payment_method: "bs" }),
      fila({ payment_amount: 10, expected_amount_usd: 30, payment_method: "efectivo", created_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(g.fraccionPagada).toBeCloseTo(1.05, 2);
    expect(g.montoPagado).toBe(35);
    expect(g.tienePendiente).toBe(false);
  });

  it("es simétrico al invertir el orden de pago", () => {
    const g = grupo([
      fila({ payment_amount: 10, expected_amount_usd: 30, payment_method: "efectivo" }),
      fila({ payment_amount: 25, expected_amount_usd: 35, payment_method: "bs", created_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(g.fraccionPagada).toBeCloseTo(1.05, 2);
  });

  it("congela el precio del primer pago por método (no retroactivo)", () => {
    const g = grupo([
      fila({ payment_amount: 5, expected_amount_usd: 35 }),
      fila({ payment_amount: 15, expected_amount_usd: 35, created_at: "2026-02-01T00:00:00Z" }),
      fila({ payment_amount: 10, expected_amount_usd: 40, created_at: "2026-03-01T00:00:00Z" }),
    ]);
    // 30/35 = 0.86 (el tercer pago usa el precio congelado 35, no 40)
    expect(g.fraccionPagada).toBeCloseTo(0.86, 2);
    expect(g.preciosPorMetodo.bs).toBe(35);
  });

  it("mes nuevo tras subir la tarifa congela el precio nuevo", () => {
    const g = grupo([fila({ payment_amount: 10, expected_amount_usd: 40 })]);
    expect(g.preciosPorMetodo.bs).toBe(40);
    expect(g.fraccionPagada).toBeCloseTo(0.25, 2);
  });

  it("sin snapshot usa el precio actual del método (legacy)", () => {
    const g = grupo([fila({ payment_amount: 17.5, expected_amount_usd: null, payment_method: "bs" })]);
    expect(g.fraccionPagada).toBeCloseTo(0.5, 2);
  });

  it("expone el método del pago más antiguo del mes", () => {
    const g = grupo([
      fila({ payment_amount: 10, expected_amount_usd: 35, payment_method: "bs", created_at: "2026-02-01T00:00:00Z" }),
      fila({ payment_amount: 5, expected_amount_usd: 30, payment_method: "efectivo", created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(g.metodoPago).toBe("efectivo");
  });

  it("solo los pagos aprobados cuentan; un pendiente bloquea", () => {
    const g = grupo([
      fila({ payment_amount: 35, expected_amount_usd: 35, status: "aprobado" }),
      fila({ payment_amount: 10, expected_amount_usd: 35, status: "pendiente", created_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(g.fraccionPagada).toBeCloseTo(1, 2);
    expect(g.tienePendiente).toBe(true);
  });

  it("la suspensión cubre el mes completo", () => {
    const g = grupo([
      fila({ payment_type: "suspension", payment_amount: 0, expected_amount_usd: 0 }),
    ], "suspension");
    expect(g.fraccionPagada).toBe(1);
    expect(g.tienePendiente).toBe(false);
  });

  it("preciosDesdeMetodos arma el mapa método → precios", () => {
    const mapa = preciosDesdeMetodos([
      { payment_method: "efectivo", amount_monthly: 30, amount_inscription: 50 },
      { payment_method: "bs", amount_monthly: "35", amount_inscription: null },
    ]);
    expect(mapa.efectivo).toEqual({ mensual: 30, inscripcion: 50 });
    expect(mapa.bs).toEqual({ mensual: 35, inscripcion: 0 });
  });
});

describe("calcularCoberturaTipo (inscripción)", () => {
  it("acumula abonos de inscripción de meses distintos", () => {
    const cobertura = calcularCoberturaTipo(
      [
        fila({ payment_type: "inscripcion", payment_amount: 20, expected_amount_usd: 50, created_at: "2026-01-01T00:00:00Z" }),
        fila({ payment_type: "inscripcion", payment_amount: 10, expected_amount_usd: 50, created_at: "2026-02-01T00:00:00Z" }),
        fila({ payment_type: "mensualidad", payment_amount: 99, expected_amount_usd: 30 }),
      ],
      "inscripcion",
      precios
    );
    expect(cobertura).not.toBeNull();
    expect(cobertura?.fraccionPagada).toBeCloseTo(0.6, 2);
    expect(cobertura?.fraccionPendiente).toBeCloseTo(0.4, 2);
    expect(cobertura?.porcentaje).toBe(60);
    expect(cobertura?.montoPagado).toBe(30);
    expect(cobertura?.metodoPago).toBe("bs");
  });

  it("devuelve null si no hay pagos de ese tipo", () => {
    expect(calcularCoberturaTipo([fila({ payment_type: "mensualidad" })], "inscripcion", precios)).toBeNull();
  });

  it("pendienteUsd usa el precio congelado del método para la inscripción", () => {
    const cobertura = calcularCoberturaTipo(
      [fila({ payment_type: "inscripcion", payment_amount: 20, expected_amount_usd: 50 })],
      "inscripcion",
      precios
    );
    if (!cobertura) throw new Error("sin cobertura");
    expect(pendienteUsd(cobertura, "bs", 999)).toBeCloseTo(0.6 * 50, 2);
    expect(pendienteUsd(cobertura, "efectivo", 999)).toBeCloseTo(0.6 * 50, 2);
  });
});

describe("deudaPorMetodo", () => {
  const concepto = (
    overrides: Partial<{ fraccionPendiente: number; preciosPorMetodo: Record<string, number>; metodoPago: string | null }> = {}
  ) => ({
    fraccionPendiente: 1,
    preciosPorMetodo: {},
    metodoPago: null as string | null,
    ...overrides,
  });

  function totales(resultado: ReturnType<typeof deudaPorMetodo>) {
    return Object.fromEntries(resultado.map((d) => [d.metodo, d.totalUsd]));
  }

  it("un mes iniciado en Bs solo suma al método Bs (precio congelado)", () => {
    const r = deudaPorMetodo(
      [concepto({ fraccionPendiente: 0.5, preciosPorMetodo: { bs: 35 }, metodoPago: "bs" })],
      null,
      precios
    );
    expect(totales(r)).toEqual({ efectivo: 0, bs: 17.5 });
  });

  it("un mes libre suma a cada método activo su precio", () => {
    const r = deudaPorMetodo([concepto()], null, precios);
    expect(totales(r)).toEqual({ efectivo: 30, bs: 35 });
  });

  it("la inscripción parcial se imputa solo a su método", () => {
    const r = deudaPorMetodo(
      [],
      concepto({ fraccionPendiente: 0.4, preciosPorMetodo: { bs: 50 }, metodoPago: "bs" }),
      precios
    );
    expect(totales(r)).toEqual({ efectivo: 0, bs: 20 });
  });

  it("la inscripción sin pagos suma a cada método", () => {
    const r = deudaPorMetodo([], concepto(), precios);
    expect(totales(r)).toEqual({ efectivo: 50, bs: 50 });
  });

  it("sin fracción pendiente no hay deuda", () => {
    const r = deudaPorMetodo([concepto({ fraccionPendiente: 0 })], concepto({ fraccionPendiente: 0 }), precios);
    expect(totales(r)).toEqual({ efectivo: 0, bs: 0 });
  });

  it("mezcla: mes libre + mes Bs parcial + inscripción efectivo parcial", () => {
    const r = deudaPorMetodo(
      [
        concepto(),
        concepto({ fraccionPendiente: 0.5, preciosPorMetodo: { bs: 35 }, metodoPago: "bs" }),
      ],
      concepto({ fraccionPendiente: 0.5, preciosPorMetodo: { efectivo: 50 }, metodoPago: "efectivo" }),
      precios
    );
    // efectivo: mes libre 30 + inscripción 25 = 55 · bs: mes libre 35 + mes Bs 17.5 = 52.5
    expect(totales(r)).toEqual({ efectivo: 55, bs: 52.5 });
  });
});

describe("distribuirSecuencial", () => {
  it("llena el mes más viejo primero y el sobrante pasa al siguiente", () => {
    expect(distribuirSecuencial(25, [10, 20])).toEqual({
      aplicados: [10, 15],
      excedente: 0,
    });
  });

  it("devuelve excedente si sobra tras cubrir todas las necesidades", () => {
    expect(distribuirSecuencial(50, [10, 20])).toEqual({
      aplicados: [10, 20],
      excedente: 20,
    });
  });

  it("pago parcial en el primer mes", () => {
    expect(distribuirSecuencial(6, [10, 20])).toEqual({
      aplicados: [6, 0],
      excedente: 0,
    });
  });

  it("sin necesidades, todo es excedente", () => {
    expect(distribuirSecuencial(10, [])).toEqual({ aplicados: [], excedente: 10 });
  });
});

describe("pendienteUsd", () => {
  const mes: MesConCobertura = {
    month_number: 11,
    year_number: 2026,
    fraccionPagada: 0.71,
    fraccionPendiente: 0.29,
    porcentaje: 71,
    montoPagado: 25,
    preciosPorMetodo: { bs: 35, efectivo: 30 },
  };

  it("usa el precio congelado del método cuando existe", () => {
    expect(pendienteUsd(mes, "bs", 999)).toBeCloseTo(0.29 * 35, 2);
    expect(pendienteUsd(mes, "efectivo", 999)).toBeCloseTo(0.29 * 30, 2);
  });

  it("cae al precio actual para métodos sin historial", () => {
    expect(pendienteUsd(mes, "binance", 20)).toBeCloseTo(0.29 * 20, 2);
  });
});
