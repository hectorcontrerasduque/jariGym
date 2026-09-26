/**
 * Unit tests for the pure pagos domain (lib/features/pagos/domain).
 * No Supabase, no fake timers: "hoy" is always an explicit argument.
 * Scenarios mirror openspec/changes/pagos-service-testable/specs/pagos/spec.md.
 */
import { describe, it, expect } from "vitest";
import { filtrarElegibles } from "@/lib/features/pagos/domain/elegibles";
import { calcularMesesPendientes } from "@/lib/features/pagos/domain/meses-pendientes";
import { calcularMorosos, calcularMiembrosAlDia, miembrosConInscripcionPagada } from "@/lib/features/pagos/domain/morosos";
import { calcularStats, calcularMonthlyStats } from "@/lib/features/pagos/domain/stats";
import type { ElegiblesResult, MiembroElegible, PagoRPCRow } from "@/lib/features/pagos/domain/types";

const HOY = new Date(2026, 8, 12, 12);

function perfil(overrides: Partial<MiembroElegible> = {}): MiembroElegible {
  return {
    id: "m1",
    email: "m1@test.com",
    full_name: "Miembro Uno",
    inscription_paid: true,
    activo: true,
    start_date: "2026-01-01",
    avatar_url: null,
    role: "miembro",
    inscription_admin_note: null,
    arrival_time: null,
    departure_time: null,
    ...overrides,
  };
}

describe("filtrarElegibles", () => {
  const base = { perfiles: [], metodoPago: null, membresias: [], gymConfig: null };

  it("activo nulo es elegible; false, 0 y 'false' no", () => {
    const perfiles = [
      perfil({ id: "null", activo: null }),
      perfil({ id: "false", activo: false }),
      perfil({ id: "zero", activo: 0 as unknown as boolean }),
      perfil({ id: "str", activo: "false" as unknown as boolean }),
    ];
    expect(filtrarElegibles({ ...base, perfiles }, HOY).miembros.map((m) => m.id)).toEqual(["null"]);
  });

  it("membresía libre con inicio futuro no cuenta; la fecha se guarda igual", () => {
    const r = filtrarElegibles(
      { ...base, membresias: [{ user_id: "a", start_date: null }, { user_id: "b", start_date: "2026-12-01" }] },
      HOY
    );
    expect([...r.miembrosLibresIds]).toEqual(["a"]);
    expect(r.fechaInicioMap.get("b")).toBe("2026-12-01");
  });

  it("la fecha de referencia es el parámetro hoy", () => {
    const membresias = [{ user_id: "a", start_date: "2026-10-01" }];
    expect(filtrarElegibles({ ...base, membresias }, HOY).miembrosLibresIds.has("a")).toBe(false);
    expect(filtrarElegibles({ ...base, membresias }, new Date(2026, 9, 2)).miembrosLibresIds.has("a")).toBe(true);
  });

  it("sin método de pago ni config: montos 0, dia_uno, owner vacío; datos nulos → listas vacías", () => {
    const r = filtrarElegibles({ perfiles: null, metodoPago: null, membresias: null, gymConfig: null }, HOY);
    expect(r).toMatchObject({ miembros: [], montoMensual: 0, montoInscripcion: 0, modoCobro: "dia_uno", ownerEmail: "" });
  });

  it("owner en minúsculas y modo configurado", () => {
    const r = filtrarElegibles({ ...base, gymConfig: { owner_email: "Dueno@Gym.COM", billing_mode: "fecha_inscripcion" } }, HOY);
    expect(r.ownerEmail).toBe("dueno@gym.com");
    expect(r.modoCobro).toBe("fecha_inscripcion");
  });
});

describe("calcularMesesPendientes", () => {
  const meses = (...m: number[]) => m.map((month_number) => ({ month_number, year_number: 2026 }));

  it("incluye meses futuros desde el mes de inicio", () => {
    expect(calcularMesesPendientes([], 2026, "2026-10-01")).toEqual(meses(10, 11, 12));
  });

  it("un detalle del año bloquea el mes; otros años y meses nulos se ignoran", () => {
    const detalles = [
      { month_number: 11, year_number: 2026 },
      { month_number: 12, year_number: 2025 },
      { month_number: null, year_number: 2026 },
    ];
    expect(calcularMesesPendientes(detalles, 2026, "2026-10-01")).toEqual(meses(10, 12));
  });

  it("inicio en año anterior o sin fecha: desde enero", () => {
    expect(calcularMesesPendientes([], 2026, "2025-06-01")).toHaveLength(12);
    expect(calcularMesesPendientes([], 2026)).toHaveLength(12);
  });

  it("inicio en año posterior → []", () => {
    expect(calcularMesesPendientes([], 2026, "2027-01-01")).toEqual([]);
  });
});

// ─── morosos / al día ────────────────────────────────────────────────────────

function eleg(overrides: Partial<ElegiblesResult> = {}): ElegiblesResult {
  return {
    miembros: [perfil()],
    miembrosLibresIds: new Set(),
    fechaInicioMap: new Map(),
    ownerEmail: "owner@gym.com",
    modoCobro: "dia_uno",
    montoMensual: 10,
    montoInscripcion: 5,
    ...overrides,
  };
}

function pago(overrides: Partial<PagoRPCRow> = {}): PagoRPCRow {
  return {
    id: "p", user_id: "m1", status: "aprobado", payment_note: null, payment_method: "efectivo",
    bill_code: null, receipt_url: null, created_at: "2026-01-01", month_number: 1, year_number: 2026,
    payment_amount: 10, payment_type: "mensualidad", ...overrides,
  };
}

describe("calcularMorosos", () => {
  it("sin pagos debe hasta el mes actual de hoy", () => {
    expect(calcularMorosos(eleg(), [], 2026, HOY)[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(calcularMorosos(eleg(), [], 2026, new Date(2026, 2, 5))[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("día de cobro: el mes actual cuenta desde ese día (fecha_inscripcion)", () => {
    const e = eleg({ modoCobro: "fecha_inscripcion", miembros: [perfil({ start_date: "2026-01-20" })] });
    expect(calcularMorosos(e, [], 2026, new Date(2026, 8, 19, 12))[0].mesesDeuda).not.toContain(9);
    expect(calcularMorosos(e, [], 2026, new Date(2026, 8, 20, 12))[0].mesesDeuda).toContain(9);
  });

  it("año anterior: hasta diciembre", () => {
    expect(calcularMorosos(eleg({ miembros: [perfil({ start_date: "2025-11-01" })] }), [], 2025, HOY)[0].mesesDeuda).toEqual([11, 12]);
  });

  it("deuda total e inscripción", () => {
    const e = eleg({ miembros: [perfil({ inscription_paid: false, start_date: "2026-08-01" })] });
    expect(calcularMorosos(e, [], 2026, HOY)[0]).toMatchObject({ debeInscripcion: true, mesesDeuda: [8, 9], totalDeuda: 25 });
  });

  it("dueño y libres fuera; cubiertos por cualquier pago aprobado", () => {
    const e = eleg({
      miembros: [perfil({ id: "o", email: "Owner@gym.com" }), perfil({ id: "l" }), perfil({ id: "m1", start_date: "2026-09-01" })],
      miembrosLibresIds: new Set(["l"]),
    });
    expect(calcularMorosos(e, [pago({ month_number: 9, payment_type: "suspension" })], 2026, HOY)).toEqual([]);
  });

  it("pendientes: monto usa el mensual si el pago es 0", () => {
    const e = eleg({ miembros: [perfil({ start_date: "2026-09-01" })] });
    const r = calcularMorosos(e, [pago({ month_number: 9 }), pago({ month_number: 10, status: "pendiente", payment_amount: 0 })], 2026, HOY);
    expect(r[0]).toMatchObject({ mesesDeuda: [], pagosPendientes: 1, montoPendiente: 10 });
  });
});

describe("miembrosConInscripcionPagada", () => {
  it("por pago aprobado de inscripción o por perfil; pendiente no cuenta", () => {
    const miembros = [perfil({ id: "a", inscription_paid: false }), perfil({ id: "b", inscription_paid: true }), perfil({ id: "c", inscription_paid: false })];
    const pagos = [pago({ user_id: "a", payment_type: "inscripcion" }), pago({ user_id: "c", payment_type: "inscripcion", status: "pendiente" })];
    expect([...miembrosConInscripcionPagada(miembros, pagos)].sort()).toEqual(["a", "b"]);
  });
});

describe("calcularMiembrosAlDia", () => {
  it("filtra dueño y libres, conserva el orden de los miembros", () => {
    const e = eleg({
      miembros: [perfil({ id: "b" }), perfil({ id: "a" }), perfil({ id: "o", email: "owner@gym.com" }), perfil({ id: "l" })],
      miembrosLibresIds: new Set(["l"]),
    });
    expect(calcularMiembrosAlDia(e, ["a", "b", "o", "l", "x"])).toEqual(["b", "a"]);
  });
});

describe("calcularStats", () => {
  it("deuda, inscritos y al día (requiere inscripción) sobre activos sin dueño", () => {
    const e = eleg({
      miembros: [
        perfil({ id: "a", inscription_paid: false, start_date: "2026-08-01" }),
        perfil({ id: "b", start_date: "2026-09-01" }),
        perfil({ id: "o", email: "owner@gym.com" }),
      ],
    });
    const pagos = [pago({ user_id: "b", month_number: 9 }), pago({ user_id: "a", month_number: 9 })];
    const morosos = calcularMorosos(e, pagos, 2026, HOY);
    const r = calcularStats(e, pagos, morosos, 2026, HOY);
    expect(r).toMatchObject({
      totalMiembros: 2,
      inscritosPagados: 1,
      inscritosPendientes: 1,
      deudoresTotal: 1,
      deudoresInscripcion: 1,
      deudoresMensualidad: 1,
      montoDeuda: 15,
      alDiaMensualidad: 1,
      montoPagado: 10,
      pagosConfirmados: 2,
    });
  });

  it("el mes de 'al día' es el mes calendario de hoy", () => {
    const e = eleg({ miembros: [perfil()] });
    const pagos = [pago({ month_number: 3 })];
    expect(calcularStats(e, pagos, [], 2026, new Date(2026, 2, 15)).alDiaMensualidad).toBe(1);
    expect(calcularStats(e, pagos, [], 2026, HOY).alDiaMensualidad).toBe(0);
  });
});

describe("calcularMonthlyStats", () => {
  it("un mes por mes transcurrido; sinPago y monto adeudado", () => {
    const e = eleg({ miembros: [perfil({ id: "a", start_date: null }), perfil({ id: "m", start_date: "2026-05-10" })] });
    const r = calcularMonthlyStats(e, [pago({ user_id: "a", month_number: 5 })], 2026, HOY);
    expect(r.meses.map((m) => m.month_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.meses[3]).toMatchObject({ pagados: 0, sinPago: 1, montoAdeudado: 10 });
    expect(r.meses[4]).toMatchObject({ pagados: 1, sinPago: 1, montoAcumulado: 10, montoAdeudado: 10 });
  });

  it("año anterior: 12 meses", () => {
    expect(calcularMonthlyStats(eleg(), [], 2025, HOY).meses).toHaveLength(12);
  });
});
