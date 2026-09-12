import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ElegiblesResult } from "@/lib/services/pagos/pagos.service";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  })),
}));

function makeElegibles(overrides: Partial<ElegiblesResult> = {}): ElegiblesResult {
  return {
    miembros: [],
    miembrosLibresIds: new Set(),
    fechaInicioMap: new Map(),
    ownerEmail: "owner@gym.com",
    modoCobro: "dia_uno",
    montoMensual: 10,
    montoInscripcion: 5,
    ...overrides,
  };
}

function makeMiembro(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    email: "test@test.com",
    full_name: "Test",
    inscription_paid: true,
    activo: true as boolean | null,
    start_date: null as string | null,
    avatar_url: null,
    role: "miembro",
    inscription_admin_note: null,
    arrival_time: null,
    departure_time: null,
    ...overrides,
  };
}

function makePagoRpc(overrides: Record<string, unknown> = {}) {
  return {
    id: "pago-1",
    user_id: "m1",
    status: "aprobado",
    payment_note: null,
    payment_method: "efectivo",
    bill_code: null,
    receipt_url: null,
    created_at: new Date().toISOString(),
    month_number: 1,
    year_number: 2026,
    payment_amount: 10,
    payment_type: "mensualidad",
    ...overrides,
  };
}

async function getMorosos(elegibles: ElegiblesResult, pagosRpc: ReturnType<typeof makePagoRpc>[], anio = 2026) {
  mockRpc.mockResolvedValueOnce({ data: pagosRpc, error: null });
  const { PagosService } = await import("@/lib/services/pagos/pagos.service");
  const service = new PagosService();
  return service.getMiembrosMorosos(anio, undefined, elegibles);
}

describe("Morosos detection — real getMiembrosMorosos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("member with no payments is moroso for all months up to current (Sep)", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result[0].totalDeuda).toBe(90);
    expect(result[0].debeInscripcion).toBe(false);
  });

  it("member who paid Jan-Jul but not Aug is moroso for Aug and Sep", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3, 4, 5, 6, 7].map((mes) =>
      makePagoRpc({ month_number: mes, year_number: 2026, status: "aprobado" })
    );

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8, 9]);
    expect(result[0].totalDeuda).toBe(20);
  });

  it("member with suspendido payment covers that month", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((mes) =>
      makePagoRpc({ month_number: mes, status: mes === 8 ? "suspendido" : "aprobado" })
    );

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(0);
  });

  it("member with pendiente payment for Aug is moroso for Aug and Sep", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3, 4, 5, 6, 7].map((mes) =>
      makePagoRpc({ month_number: mes, status: "aprobado" })
    );
    pagos.push(makePagoRpc({ month_number: 8, status: "pendiente" }));

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8, 9]);
  });

  it("free membership member is NOT moroso", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
      miembrosLibresIds: new Set(["m1"]),
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(0);
  });

  it("gym owner is NOT moroso", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ email: "owner@gym.com", start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(0);
  });

  it("member without inscription paid gets debeInscripcion=true", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: false, start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((mes) =>
      makePagoRpc({ month_number: mes, status: "aprobado" })
    );

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(true);
    expect(result[0].mesesDeuda).toEqual([]);
    expect(result[0].totalDeuda).toBe(5);
  });

  it("member with inscription paid via profile flag is NOT moroso for inscription", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: true, start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3].map((mes) =>
      makePagoRpc({ month_number: mes, status: "aprobado" })
    );

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
  });

  it("member with inscription paid via approved pago type is NOT moroso for inscription", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: false, start_date: "2026-01-01" })],
    });
    const pagos = [
      makePagoRpc({ month_number: 1, status: "aprobado", payment_type: "inscripcion" }),
    ];

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
  });

  it("member who joined in March owes from March (no grace period)", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-03-15" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(result[0].totalDeuda).toBe(70);
  });

  it("membresia start_date takes precedence over profile start_date", async () => {
    const fechaInicioMap = new Map([["m1", "2026-05-01"]]);
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
      fechaInicioMap,
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([5, 6, 7, 8, 9]);
    expect(result[0].totalDeuda).toBe(50);
  });

  it("member who joined next year is NOT moroso this year", async () => {
    const fechaInicioMap = new Map([["m1", "2027-01-15"]]);
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: null })],
      fechaInicioMap,
    });

    const result = await getMorosos(elegibles, [], 2026);

    expect(result).toHaveLength(0);
  });

  it("multiple morosos are returned correctly", async () => {
    const elegibles = makeElegibles({
      miembros: [
        makeMiembro({ id: "m1", full_name: "Member 1", start_date: "2026-01-01" }),
        makeMiembro({ id: "m2", full_name: "Member 2", start_date: "2026-01-01" }),
      ],
    });
    const pagosM1 = [1, 2, 3, 4, 5, 6, 7].map((mes) =>
      makePagoRpc({ user_id: "m1", month_number: mes, status: "aprobado" })
    );
    const pagosM2 = [1, 2, 3, 4, 5].map((mes) =>
      makePagoRpc({ user_id: "m2", month_number: mes, status: "aprobado" })
    );

    const result = await getMorosos(elegibles, [...pagosM1, ...pagosM2]);

    expect(result).toHaveLength(2);
    const m1 = result.find((r) => r.id === "m1");
    const m2 = result.find((r) => r.id === "m2");
    expect(m1?.mesesDeuda).toEqual([8, 9]);
    expect(m2?.mesesDeuda).toEqual([6, 7, 8, 9]);
  });

  it("member with activo=null is considered active", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ activo: null, start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
  });

  it("owner email case-insensitive check works", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ email: "OWNER@GYM.COM", start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(0);
  });

  it("member with montoMensual=0 has zero totalDeuda for months", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: false, start_date: "2026-01-01" })],
      montoMensual: 0,
      montoInscripcion: 5,
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].totalDeuda).toBe(5);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("member with activo=false is still included if has debt", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ activo: false, start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("empty elegibles returns empty", async () => {
    const elegibles = makeElegibles({ miembros: [] });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(0);
  });

  it("member with suspendido_pendiente payment is still moroso for that month", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3, 4, 5, 6, 7].map((mes) =>
      makePagoRpc({ month_number: mes, status: "aprobado" })
    );
    pagos.push(makePagoRpc({ month_number: 8, status: "suspendido_pendiente" }));

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toContain(8);
  });

  it("member with rechazado payment is moroso for that month", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });
    const pagos = [1, 2, 3, 4, 5, 6, 7].map((mes) =>
      makePagoRpc({ month_number: mes, status: "aprobado" })
    );
    pagos.push(makePagoRpc({ month_number: 8, status: "rechazado" }));

    const result = await getMorosos(elegibles, pagos);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toContain(8);
  });

  it("member with far future start_date is NOT moroso", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2099-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(0);
  });

  it("member with past start_date owes current year months only", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2020-06-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("member with large inscription amount calculates total correctly", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: false, start_date: "2026-01-01" })],
      montoMensual: 15,
      montoInscripcion: 100,
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    // 9 months * 15 + 100 inscription = 235
    expect(result[0].totalDeuda).toBe(235);
  });
});

describe("Morosos — diaCobro check on current month", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fecha_inscripcion: member is NOT moroso for current month if today < diaCobro", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 27));

    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-28" })],
      modoCobro: "fecha_inscripcion",
    });

    const result = await getMorosos(elegibles, [], 2026);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });

  it("fecha_inscripcion: member IS moroso for current month if today >= diaCobro", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 28));

    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-28" })],
      modoCobro: "fecha_inscripcion",
    });

    const result = await getMorosos(elegibles, [], 2026);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("fecha_inscripcion: diaCobro clamped to 28 for February", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 28));

    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-31" })],
      modoCobro: "fecha_inscripcion",
    });

    const result = await getMorosos(elegibles, [], 2026);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });
});

describe("Morosos — inscription debt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("member without inscription paid owes inscription + months", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: false, start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(true);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result[0].totalDeuda).toBe(95);
  });

  it("member with inscription paid but no monthly payments owes only months", async () => {
    const elegibles = makeElegibles({
      miembros: [makeMiembro({ inscription_paid: true, start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result[0].totalDeuda).toBe(90);
  });
});

describe("Morosos — no grace period", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("member who entered Aug 16 owes from August (not September)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 12));

    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-08-16" })],
    });

    const result = await getMorosos(elegibles, []);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8, 9]);
    expect(result[0].totalDeuda).toBe(20);
  });

  it("member who entered Dec 31 owes only December", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31));

    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-12-31" })],
    });

    const result = await getMorosos(elegibles, [], 2026);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([12]);
  });

  it("member who entered Jan 1 owes from January (not February)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15));

    const elegibles = makeElegibles({
      miembros: [makeMiembro({ start_date: "2026-01-01" })],
    });

    const result = await getMorosos(elegibles, [], 2026);

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });
});
