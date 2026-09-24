/**
 * Characterization tests for PagosService.
 * They pin the CURRENT behavior described in
 * openspec/changes/pagos-service-testable/specs/pagos/spec.md.
 * If a refactor makes one fail, fix the refactor — not the test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { messages } from "@/lib/messages";
import { getMonthName } from "@/lib/utils";
import { PagosService, type ElegiblesResult } from "@/lib/services/pagos/pagos.service";

const h = vi.hoisted(() => ({ fake: undefined as SupabaseFake | undefined }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => h.fake?.client }));

const HOY = new Date(2026, 8, 12, 12); // 12 Sep 2026, midday local
const HOY_ISO_DATE = HOY.toISOString().split("T")[0];
const ADMIN = { id: "admin-1", email: "owner@gym.com" };

let fake: SupabaseFake;
let service: PagosService;

function makeService() {
  fake = createSupabaseFake();
  h.fake = fake;
  return new PagosService();
}

function miembro(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    email: "m1@test.com",
    full_name: "Miembro Uno",
    inscription_paid: true,
    activo: true as boolean | null,
    start_date: "2026-01-01" as string | null,
    avatar_url: null,
    role: "miembro",
    inscription_admin_note: null,
    arrival_time: null,
    departure_time: null,
    ...overrides,
  };
}

function elegibles(overrides: Partial<ElegiblesResult> = {}): ElegiblesResult {
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

function pagoRpc(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-rpc",
    user_id: "m1",
    status: "aprobado",
    payment_note: null,
    payment_method: "efectivo",
    bill_code: null,
    receipt_url: null,
    created_at: HOY.toISOString(),
    month_number: 1,
    year_number: 2026,
    payment_amount: 10,
    payment_type: "mensualidad",
    ...overrides,
  };
}

const mensualidades = (userId: string, meses: number[], extra: Record<string, unknown> = {}) =>
  meses.map((m) => pagoRpc({ id: `p-${userId}-${m}`, user_id: userId, month_number: m, ...extra }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOY);
  service = makeService();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Requirement: Miembros elegibles para cobro ──────────────────────────────

describe("getMiembrosElegibles", () => {
  function queue({
    perfiles = [] as unknown[],
    metodo = { amount_monthly: 25, amount_inscription: 15 } as unknown,
    membresias = [] as unknown[],
    config = { owner_email: "Owner@Gym.com", billing_mode: "fecha_inscripcion" } as unknown,
  } = {}) {
    fake.on("profiles", "select").reply({ data: perfiles });
    fake.on("gym_config_payment_methods", "select").reply({ data: metodo });
    fake.on("memberships", "select").reply({ data: membresias });
    fake.on("gym_config", "select").reply({ data: config });
  }

  it("perfil con activo nulo es elegible; activo false, 0 o 'false' no", async () => {
    queue({
      perfiles: [
        miembro({ id: "null", activo: null }),
        miembro({ id: "true", activo: true }),
        miembro({ id: "false", activo: false }),
        miembro({ id: "zero", activo: 0 }),
        miembro({ id: "str", activo: "false" }),
      ],
    });
    const r = await service.getMiembrosElegibles();
    expect(r.miembros.map((m) => m.id)).toEqual(["null", "true"]);
  });

  it("consulta perfiles miembro/super_admin con email", async () => {
    queue();
    await service.getMiembrosElegibles();
    const [call] = fake.callsTo("profiles", "select");
    expect(call.filters).toContainEqual(["in", "role", ["miembro", "super_admin"]]);
    expect(call.filters).toContainEqual(["not", "email", "is", null]);
  });

  it("membresía libre: inicio nulo o pasado cuenta, inicio futuro no; fechaInicioMap guarda todas las fechas", async () => {
    queue({
      membresias: [
        { user_id: "sin-fecha", start_date: null },
        { user_id: "pasada", start_date: "2026-01-01" },
        { user_id: "futura", start_date: "2026-12-01" },
      ],
    });
    const r = await service.getMiembrosElegibles();
    expect([...r.miembrosLibresIds]).toEqual(["sin-fecha", "pasada"]);
    expect(Object.fromEntries(r.fechaInicioMap)).toEqual({ pasada: "2026-01-01", futura: "2026-12-01" });
    const [call] = fake.callsTo("memberships", "select");
    expect(call.filters).toContainEqual(["eq", "status", "activa"]);
    expect(call.filters).toContainEqual(["is", "end_date", null]);
  });

  it("config: owner en minúsculas, modo y montos del método activo", async () => {
    queue();
    const r = await service.getMiembrosElegibles();
    expect(r.ownerEmail).toBe("owner@gym.com");
    expect(r.modoCobro).toBe("fecha_inscripcion");
    expect(r.montoMensual).toBe(25);
    expect(r.montoInscripcion).toBe(15);
  });

  it("sin método de pago activo ni config: montos 0, modo dia_uno, owner vacío", async () => {
    queue({ metodo: null, config: null });
    const r = await service.getMiembrosElegibles();
    expect(r.montoMensual).toBe(0);
    expect(r.montoInscripcion).toBe(0);
    expect(r.modoCobro).toBe("dia_uno");
    expect(r.ownerEmail).toBe("");
  });

  it("usa el cliente pasado por parámetro en vez del interno", async () => {
    const otro = createSupabaseFake();
    otro.on("profiles", "select").reply({ data: [miembro()] });
    const r = await service.getMiembrosElegibles(otro.client);
    expect(r.miembros).toHaveLength(1);
    expect(fake.calls).toHaveLength(0);
  });
});

// ─── Requirement: Cálculo de miembros morosos ────────────────────────────────

describe("getMiembrosMorosos", () => {
  async function morosos(e: ElegiblesResult, pagos: unknown[], anio = 2026) {
    fake.onRpc("get_pagos_por_anio").reply({ data: pagos });
    return service.getMiembrosMorosos(anio, undefined, e);
  }

  it("miembro sin pagos desde enero debe [1..9]", async () => {
    const r = await morosos(elegibles({ miembros: [miembro()] }), []);
    expect(r).toEqual([
      {
        id: "m1",
        email: "m1@test.com",
        full_name: "Miembro Uno",
        deudas: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ month_number: m, year_number: 2026, payment_amount: 10 })),
        totalDeuda: 90,
        debeInscripcion: false,
        mesesDeuda: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        pagosPendientes: 0,
        montoPendiente: 0,
      },
    ]);
    expect(fake.calls[0]).toMatchObject({ kind: "rpc", table: "get_pagos_por_anio", payload: { p_anio: 2026 } });
  });

  it("mes actual antes del día de cobro (fecha_inscripcion) no se cuenta", async () => {
    const e = elegibles({ modoCobro: "fecha_inscripcion", miembros: [miembro({ start_date: "2026-01-20" })] });
    const r = await morosos(e, []);
    expect(r[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("mes actual el mismo día de cobro sí se cuenta", async () => {
    const e = elegibles({ modoCobro: "fecha_inscripcion", miembros: [miembro({ start_date: "2026-01-12" })] });
    const r = await morosos(e, []);
    expect(r[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("pago aprobado de cualquier tipo cubre el mes", async () => {
    const pagos = [pagoRpc({ month_number: 3, payment_type: "suspension", payment_amount: 0 })];
    const r = await morosos(elegibles({ miembros: [miembro()] }), pagos);
    expect(r[0].mesesDeuda).toEqual([1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it("pago pendiente no cubre el mes", async () => {
    const pagos = [pagoRpc({ month_number: 3, status: "pendiente" })];
    const r = await morosos(elegibles({ miembros: [miembro()] }), pagos);
    expect(r[0].mesesDeuda).toContain(3);
  });

  it("solo pagos pendientes: moroso sin meses, monto pendiente usa el mensual si el pago es 0", async () => {
    const pagos = [
      ...mensualidades("m1", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
      pagoRpc({ id: "pend", month_number: 10, status: "pendiente", payment_amount: 0 }),
    ];
    const r = await morosos(elegibles({ miembros: [miembro()] }), pagos);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mesesDeuda: [], totalDeuda: 0, pagosPendientes: 1, montoPendiente: 10, debeInscripcion: false });
  });

  it("dueño (sin importar mayúsculas) y membresía libre excluidos", async () => {
    const e = elegibles({
      miembros: [miembro({ id: "owner", email: "OWNER@gym.com" }), miembro({ id: "libre", email: "l@t.com" })],
      miembrosLibresIds: new Set(["libre"]),
    });
    expect(await morosos(e, [])).toEqual([]);
  });

  it("sin miembros elegibles devuelve [] sin consultar pagos", async () => {
    const r = await service.getMiembrosMorosos(2026, undefined, elegibles());
    expect(r).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("debe inscripción si no está pagada: suma el monto de inscripción", async () => {
    const r = await morosos(elegibles({ miembros: [miembro({ inscription_paid: false, start_date: "2026-09-01" })] }), []);
    expect(r[0]).toMatchObject({ debeInscripcion: true, mesesDeuda: [9], totalDeuda: 15 });
  });

  it("pago aprobado de inscripción en el año cuenta como inscripción pagada", async () => {
    const pagos = [pagoRpc({ month_number: null, payment_type: "inscripcion", payment_amount: 5 })];
    const r = await morosos(elegibles({ miembros: [miembro({ inscription_paid: false, start_date: "2026-09-01" })] }), pagos);
    expect(r[0]).toMatchObject({ debeInscripcion: false, mesesDeuda: [9], totalDeuda: 10 });
  });

  it("membresía con inicio pasado tiene prioridad sobre start_date del perfil", async () => {
    const e = elegibles({ miembros: [miembro({ start_date: "2026-03-01" })], fechaInicioMap: new Map([["m1", "2026-07-01"]]) });
    expect((await morosos(e, []))[0].mesesDeuda).toEqual([7, 8, 9]);
  });

  it("membresía con inicio futuro usa start_date del perfil", async () => {
    const e = elegibles({ miembros: [miembro({ start_date: "2026-08-01" })], fechaInicioMap: new Map([["m1", "2026-12-01"]]) });
    expect((await morosos(e, []))[0].mesesDeuda).toEqual([8, 9]);
  });

  it("membresía con inicio futuro y sin start_date: se omite", async () => {
    const e = elegibles({ miembros: [miembro({ start_date: null })], fechaInicioMap: new Map([["m1", "2026-12-01"]]) });
    expect(await morosos(e, [])).toEqual([]);
  });

  it("sin fecha de inicio: deuda desde enero", async () => {
    const r = await morosos(elegibles({ miembros: [miembro({ start_date: null })] }), []);
    expect(r[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("inicio en año posterior al consultado: se omite", async () => {
    expect(await morosos(elegibles({ miembros: [miembro({ start_date: "2027-01-01" })] }), [])).toEqual([]);
  });

  it("año anterior: mes tope diciembre", async () => {
    const r = await morosos(elegibles({ miembros: [miembro({ start_date: "2025-06-01" })] }), [], 2025);
    expect(r[0].mesesDeuda).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(fake.calls[0].payload).toEqual({ p_anio: 2025 });
  });
});

// ─── Requirement: Miembros al día ────────────────────────────────────────────

describe("getMiembrosAlDia", () => {
  const e = () =>
    elegibles({
      miembros: [
        miembro({ id: "d", email: "d@t.com" }),
        miembro({ id: "e", email: "e@t.com", inscription_paid: false }),
        miembro({ id: "l", email: "l@t.com" }),
        miembro({ id: "owner-id", email: "owner@gym.com" }),
      ],
      miembrosLibresIds: new Set(["l"]),
    });

  it("miembros con pago aprobado mensualidad/suspensión del mes actual; sin exigir inscripción; excluye dueño y libres", async () => {
    fake.on("payment_detail", "select").reply({ data: [{ payment_id: "p1" }, { payment_id: "p1" }, { payment_id: "p2" }, { payment_id: "p3" }, { payment_id: "p4" }] });
    fake.on("payments", "select").reply({
      data: [
        { id: "p1", user_id: "d" },
        { id: "p2", user_id: "e" },
        { id: "p3", user_id: "l" },
        { id: "p4", user_id: "owner-id" },
      ],
    });
    const r = await service.getMiembrosAlDia(2026, undefined, e());
    expect(r).toEqual(["d", "e"]);

    const [det] = fake.callsTo("payment_detail", "select");
    expect(det.filters).toContainEqual(["eq", "month_number", 9]);
    expect(det.filters).toContainEqual(["eq", "year_number", 2026]);
    expect(det.filters).toContainEqual(["in", "payment_type", ["mensualidad", "suspension"]]);
    const [pay] = fake.callsTo("payments", "select");
    expect(pay.filters).toContainEqual(["in", "id", ["p1", "p2", "p3", "p4"]]);
    // Pagos pendientes quedan fuera por este filtro
    expect(pay.filters).toContainEqual(["in", "status", ["aprobado"]]);
  });

  it("sin detalles del mes no consulta cabeceras y devuelve []", async () => {
    fake.on("payment_detail", "select").reply({ data: [] });
    expect(await service.getMiembrosAlDia(2026, undefined, e())).toEqual([]);
    expect(fake.callsTo("payments")).toHaveLength(0);
  });
});

// ─── Requirement: Estadísticas anuales del dashboard ─────────────────────────

describe("stats", () => {
  it("monto de deuda y conteos de inscripción", async () => {
    const e = elegibles({
      miembros: [
        miembro({ id: "a", email: "a@t.com", inscription_paid: false, start_date: "2026-08-01" }),
        miembro({ id: "b", email: "b@t.com", start_date: "2026-09-01" }),
        miembro({ id: "owner-id", email: "owner@gym.com" }),
      ],
    });
    fake.onRpc("get_pagos_por_anio").reply({ data: [] }).reply({ data: [] });

    expect(await service.stats(2026, undefined, e)).toEqual({
      totalMiembros: 2,
      miembrosActivos: 2,
      inscritosPagados: 1,
      inscritosPendientes: 1,
      deudoresTotal: 2,
      deudoresInscripcion: 1,
      deudoresMensualidad: 2,
      alDiaMensualidad: 0,
      montoDeuda: 35,
      montoDeudaInscripcion: 5,
      montoDeudaMensualidad: 30,
      montoPagado: 0,
      membresiaLibre: 0,
      pagosConfirmados: 0,
      pagosPendientes: 0,
      ingresosMes: 0,
    });
  });

  it("al día exige inscripción pagada; libres cuentan como activos; consulta el RPC dos veces", async () => {
    const e = elegibles({
      miembros: [
        miembro({ id: "d", email: "d@t.com", start_date: "2026-09-01" }),
        miembro({ id: "e", email: "e@t.com", inscription_paid: false, start_date: "2026-09-01" }),
        miembro({ id: "l", email: "l@t.com" }),
      ],
      miembrosLibresIds: new Set(["l"]),
    });
    const pagos = [...mensualidades("d", [9]), ...mensualidades("e", [9])];
    fake.onRpc("get_pagos_por_anio").reply({ data: pagos }).reply({ data: pagos });

    expect(await service.stats(2026, undefined, e)).toEqual({
      totalMiembros: 3,
      miembrosActivos: 3,
      inscritosPagados: 2,
      inscritosPendientes: 1,
      deudoresTotal: 1,
      deudoresInscripcion: 1,
      deudoresMensualidad: 0,
      alDiaMensualidad: 1,
      montoDeuda: 5,
      montoDeudaInscripcion: 5,
      montoDeudaMensualidad: 0,
      montoPagado: 10,
      membresiaLibre: 1,
      pagosConfirmados: 2,
      pagosPendientes: 0,
      ingresosMes: 10,
    });
    // Comportamiento actual preservado: stats y getMiembrosMorosos consultan el mismo RPC.
    const rpcs = fake.calls.filter((c) => c.kind === "rpc");
    expect(rpcs.map((c) => c.payload)).toEqual([{ p_anio: 2026 }, { p_anio: 2026 }]);
  });

  it("cuenta líneas de detalle aprobadas y pendientes del año", async () => {
    const e = elegibles({ miembros: [miembro()] });
    const pagos = [
      ...mensualidades("m1", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
      pagoRpc({ id: "x1", month_number: 10, status: "pendiente" }),
      pagoRpc({ id: "x2", month_number: 11, status: "rechazado" }),
    ];
    fake.onRpc("get_pagos_por_anio").reply({ data: pagos }).reply({ data: pagos });
    const r = await service.stats(2026, undefined, e);
    expect(r.pagosConfirmados).toBe(9);
    expect(r.pagosPendientes).toBe(1);
    expect(r.alDiaMensualidad).toBe(1);
  });
});

// ─── Requirement: Estadísticas mensuales del dashboard ───────────────────────

describe("monthlyStats", () => {
  const e = () =>
    elegibles({
      miembros: [
        miembro({ id: "owner-id", email: "owner@gym.com" }),
        miembro({ id: "a", email: "a@t.com", start_date: null }),
        miembro({ id: "m", email: "m@t.com", start_date: "2026-05-10" }),
      ],
      miembrosLibresIds: new Set(["z"]),
    });

  it("meses hasta el actual, grupo por fecha de inicio, montos de todos los usuarios", async () => {
    fake.onRpc("get_pagos_por_anio").reply({
      data: [
        pagoRpc({ user_id: "a", month_number: 5 }),
        pagoRpc({ user_id: "a", month_number: 5, status: "pendiente" }),
        pagoRpc({ user_id: "x", month_number: 5, payment_amount: 7 }),
        pagoRpc({ user_id: "m", month_number: 3, status: "pendiente" }),
      ],
    });
    const r = await service.monthlyStats(2026, undefined, e());

    expect(r.totalMiembros).toBe(2);
    expect(r.libres).toBe(1);
    expect(r.meses).toHaveLength(9);
    expect(r.meses[0]).toEqual({
      month_number: 1, year_number: 2026, nombre: getMonthName(1),
      pagados: 0, pendientes: 0, sinPago: 1, libres: 0,
      montoAcumulado: 0, montoAdeudado: 10, montoPendiente: 0,
    });
    // Marzo: "m" aún no inicia → su pendiente no cuenta en el grupo, pero sí en el monto
    expect(r.meses[2]).toMatchObject({ pendientes: 0, sinPago: 1, montoPendiente: 10 });
    // Mayo: "m" ya cuenta; "a" con aprobado y pendiente cuenta en ambos
    expect(r.meses[4]).toEqual({
      month_number: 5, year_number: 2026, nombre: getMonthName(5),
      pagados: 1, pendientes: 1, sinPago: 0, libres: 0,
      montoAcumulado: 17, montoAdeudado: 0, montoPendiente: 10,
    });
  });

  it("año anterior: 12 meses", async () => {
    fake.onRpc("get_pagos_por_anio").reply({ data: [] });
    const r = await service.monthlyStats(2025, undefined, e());
    expect(r.meses).toHaveLength(12);
    expect(fake.calls[0].payload).toEqual({ p_anio: 2025 });
  });
});

// ─── Requirement: Meses pendientes de un miembro ─────────────────────────────

describe("mesesPendientes", () => {
  const meses = (...m: number[]) => m.map((month_number) => ({ month_number, year_number: 2026 }));

  it("incluye meses futuros del año desde el mes de inicio", async () => {
    fake.on("payment_detail", "select").reply({ data: [] });
    expect(await service.mesesPendientes("u1", 2026, undefined, "2026-10-01")).toEqual(meses(10, 11, 12));
    const [call] = fake.callsTo("payment_detail", "select");
    expect(call.filters).toContainEqual(["eq", "payments.user_id", "u1"]);
    expect(call.filters).toContainEqual(["in", "payments.status", ["aprobado", "pendiente"]]);
    expect(call.filters).toContainEqual(["not", "month_number", "is", null]);
  });

  it("un detalle aprobado o pendiente bloquea el mes; ignora otros años", async () => {
    fake.on("payment_detail", "select").reply({ data: [{ month_number: 11, year_number: 2026 }, { month_number: 12, year_number: 2025 }] });
    expect(await service.mesesPendientes("u1", 2026, undefined, "2026-10-01")).toEqual(meses(10, 12));
  });

  it("sin fecha de inicio y año por defecto: enero a diciembre del año actual", async () => {
    fake.on("payment_detail", "select").reply({ data: [] });
    expect(await service.mesesPendientes("u1")).toEqual(meses(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
  });

  it("inicio en año posterior → []", async () => {
    fake.on("payment_detail", "select").reply({ data: [] });
    expect(await service.mesesPendientes("u1", 2026, undefined, "2027-02-01")).toEqual([]);
  });

  it("error de consulta → []", async () => {
    fake.on("payment_detail", "select").reply({ error: { message: "boom" } });
    expect(await service.mesesPendientes("u1", 2026)).toEqual([]);
  });

  it("mesesPendientesAdmin delega con los mismos argumentos", async () => {
    fake.on("payment_detail", "select").reply({ data: [] });
    expect(await service.mesesPendientesAdmin("u1", 2026, undefined, "2026-11-15")).toEqual(meses(11, 12));
  });
});

// ─── Requirement: Registrar un pago ──────────────────────────────────────────

describe("crearPago", () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    user_id: "m1",
    payment_method: "efectivo" as const,
    receipt_url: "https://r/comprobante.png",
    detalles: [{ month_number: 9, year_number: 2026, payment_type: "mensualidad" as const, payment_amount: 10 }],
    ...overrides,
  });

  it("sin sesión: falla con 'no autenticado' y no escribe", async () => {
    await expect(service.crearPago(input())).rejects.toThrow(messages.toast.noAutenticado);
    expect(fake.calls).toHaveLength(0);
  });

  it("crea cabecera pendiente (efectivo sin comprobante) y detalles", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ data: { id: "p1", status: "pendiente" } });
    const r = await service.crearPago(input());

    expect(fake.callsTo("payments", "insert")[0].payload).toEqual({
      user_id: "m1",
      status: "pendiente",
      payment_method: "efectivo",
      bill_code: null,
      receipt_url: null,
      payment_note: null,
      created_by: "admin-1",
    });
    const detalle = [{ payment_id: "p1", month_number: 9, year_number: 2026, payment_type: "mensualidad", payment_amount: 10 }];
    expect(fake.callsTo("payment_detail", "insert")[0].payload).toEqual(detalle);
    expect(r).toEqual({ id: "p1", status: "pendiente", detail: detalle });
  });

  it("métodos distintos a efectivo conservan el comprobante", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ data: { id: "p1" } });
    await service.crearPago(input({ payment_method: "binance", bill_code: "B1", payment_note: "nota" }));
    expect(fake.callsTo("payments", "insert")[0].payload).toMatchObject({
      receipt_url: "https://r/comprobante.png",
      bill_code: "B1",
      payment_note: "nota",
    });
  });

  it("rechazo por RLS", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ error: { message: "new row violates row-level security policy for table \"payments\"" } });
    await expect(service.crearPago(input())).rejects.toThrow("No tienes permiso para registrar este pago");
  });

  it("otro error en cabecera → mensaje genérico", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ error: { message: "timeout" } });
    await expect(service.crearPago(input())).rejects.toThrow(messages.toast.pagoError);
    expect(fake.callsTo("payment_detail")).toHaveLength(0);
  });

  it("falla el detalle → borra la cabecera y falla", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ data: { id: "p1" } });
    fake.on("payment_detail", "insert").reply({ error: { message: "fk" } });
    await expect(service.crearPago(input())).rejects.toThrow(messages.toast.pagoError);
    const [del] = fake.callsTo("payments", "delete");
    expect(del.filters).toContainEqual(["eq", "id", "p1"]);
  });
});

// ─── Requirement: Registrar un pago ya aprobado ──────────────────────────────

describe("crearPagoAprobado", () => {
  const input = (tipo: "mensualidad" | "inscripcion") => ({
    user_id: "m1",
    payment_method: "efectivo" as const,
    detalles: [{ month_number: tipo === "inscripcion" ? null : 9, year_number: 2026, payment_type: tipo, payment_amount: 10 }],
  });

  it("usuario sin rol super_admin: 'no autorizado' y no escribe pagos", async () => {
    fake.setUser({ id: "u2" });
    fake.on("profiles", "select").reply({ data: { role: "miembro" } });
    await expect(service.crearPagoAprobado(input("mensualidad"))).rejects.toThrow(messages.toast.noAutorizado);
    expect(fake.callsTo("payments")).toHaveLength(0);
  });

  it("sin sesión: 'no autenticado'", async () => {
    await expect(service.crearPagoAprobado(input("mensualidad"))).rejects.toThrow(messages.toast.noAutenticado);
  });

  it("super_admin: cabecera aprobada con aprobador; inscripción marca el perfil", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "insert").reply({ data: { id: "p1" } });
    await service.crearPagoAprobado(input("inscripcion"));

    expect(fake.callsTo("payments", "insert")[0].payload).toEqual({
      user_id: "m1",
      status: "aprobado",
      payment_method: "efectivo",
      bill_code: null,
      receipt_url: null,
      payment_note: null,
      created_by: "admin-1",
      approved_by: "admin-1",
      approved_at: HOY.toISOString(),
    });
    const [upd] = fake.callsTo("profiles", "update");
    expect(upd.payload).toEqual({ inscription_paid: true, inscription_date: HOY_ISO_DATE });
    expect(upd.filters).toContainEqual(["eq", "id", "m1"]);
  });

  it("sin línea de inscripción no toca el perfil", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "insert").reply({ data: { id: "p1" } });
    await service.crearPagoAprobado(input("mensualidad"));
    expect(fake.callsTo("profiles", "update")).toHaveLength(0);
  });

  it("falla el detalle → borra la cabecera", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "insert").reply({ data: { id: "p1" } });
    fake.on("payment_detail", "insert").reply({ error: { message: "x" } });
    await expect(service.crearPagoAprobado(input("inscripcion"))).rejects.toThrow(messages.toast.pagoError);
    expect(fake.callsTo("payments", "delete")[0].filters).toContainEqual(["eq", "id", "p1"]);
    expect(fake.callsTo("profiles", "update")).toHaveLength(0);
  });
});

// ─── Requirement: Aprobar y rechazar pagos ───────────────────────────────────

describe("aprobarPago", () => {
  it("super_admin aprueba (sin filtrar por estado previo) e inscripción marca el perfil", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "update").reply({ data: { id: "p1", user_id: "m1", status: "aprobado" } });
    fake.on("payment_detail", "select").reply({ data: [{ payment_type: "inscripcion" }] });

    const r = await service.aprobarPago("p1");
    expect(r).toEqual({ id: "p1", user_id: "m1", status: "aprobado" });

    const [upd] = fake.callsTo("payments", "update");
    expect(upd.payload).toEqual({ status: "aprobado", approved_by: "admin-1", approved_at: HOY.toISOString() });
    // Comportamiento actual preservado: aprobar no filtra por status.
    expect(upd.filters.filter((f) => f[0] === "eq")).toEqual([["eq", "id", "p1"]]);
    expect(fake.callsTo("payment_detail", "select")[0].filters).toContainEqual(["eq", "payment_id", "p1"]);
    const [prof] = fake.callsTo("profiles", "update");
    expect(prof.payload).toEqual({ inscription_paid: true, inscription_date: HOY_ISO_DATE });
    expect(prof.filters).toContainEqual(["eq", "id", "m1"]);
  });

  it("sin inscripción no toca el perfil", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "update").reply({ data: { id: "p1", user_id: "m1" } });
    fake.on("payment_detail", "select").reply({ data: [{ payment_type: "mensualidad" }] });
    await service.aprobarPago("p1");
    expect(fake.callsTo("profiles", "update")).toHaveLength(0);
  });

  it("miembro intenta aprobar → 'no autorizado'", async () => {
    fake.setUser({ id: "u2" });
    fake.on("profiles", "select").reply({ data: { role: "miembro" } });
    await expect(service.aprobarPago("p1")).rejects.toThrow(messages.toast.noAutorizado);
    expect(fake.callsTo("payments")).toHaveLength(0);
  });

  it("sin sesión → 'no autenticado'", async () => {
    await expect(service.aprobarPago("p1")).rejects.toThrow(messages.toast.noAutenticado);
  });

  it("error de base de datos se propaga sin traducir", async () => {
    const err = { message: "db down", code: "500" };
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "update").reply({ error: err });
    await expect(service.aprobarPago("p1")).rejects.toBe(err);
  });
});

describe("rechazarPago", () => {
  it("rechaza solo pendientes con nota por defecto 'Pago rechazado'", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "update").reply({ data: { id: "p1", status: "rechazado" } });

    expect(await service.rechazarPago("p1")).toEqual({ id: "p1", status: "rechazado" });
    const [upd] = fake.callsTo("payments", "update");
    expect(upd.payload).toEqual({
      status: "rechazado",
      payment_note: "Pago rechazado",
      approved_by: "admin-1",
      approved_at: HOY.toISOString(),
    });
    expect(upd.filters).toContainEqual(["eq", "id", "p1"]);
    expect(upd.filters).toContainEqual(["eq", "status", "pendiente"]);
  });

  it("usa la nota indicada", async () => {
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    await service.rechazarPago("p1", "Comprobante ilegible");
    expect(fake.callsTo("payments", "update")[0].payload).toMatchObject({ payment_note: "Comprobante ilegible" });
  });

  it("miembro → 'no autorizado'", async () => {
    fake.setUser({ id: "u2" });
    fake.on("profiles", "select").reply({ data: { role: "miembro" } });
    await expect(service.rechazarPago("p1")).rejects.toThrow(messages.toast.noAutorizado);
  });

  it("error de base de datos se propaga sin traducir", async () => {
    const err = { message: "no rows" };
    fake.setUser(ADMIN);
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "update").reply({ error: err });
    await expect(service.rechazarPago("p1")).rejects.toBe(err);
  });
});

// ─── Requirement: Solicitar suspensión de meses ──────────────────────────────

describe("crearPagoSuspendido", () => {
  const meses = [
    { month_number: 2, year_number: 2026 },
    { month_number: 3, year_number: 2026 },
  ];

  it("crea un pago pendiente en efectivo con una línea 'suspension' de 0 por mes y devuelve la cantidad", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ data: { id: "s1" } });

    expect(await service.crearPagoSuspendido("m1", meses)).toBe(2);
    const busquedas = fake.callsTo("payment_detail", "select");
    expect(busquedas).toHaveLength(2);
    expect(busquedas[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "month_number", 2],
        ["eq", "year_number", 2026],
        ["eq", "payments.user_id", "m1"],
        ["in", "payments.status", ["pendiente"]],
      ])
    );
    expect(fake.callsTo("payments", "update")).toHaveLength(0);
    expect(fake.callsTo("payments", "insert")[0].payload).toEqual({
      user_id: "m1",
      status: "pendiente",
      payment_method: "efectivo",
      payment_note: "Solicitud de suspensión",
      created_by: "admin-1",
    });
    expect(fake.callsTo("payment_detail", "insert")[0].payload).toEqual([
      { payment_id: "s1", month_number: 2, year_number: 2026, payment_type: "suspension", payment_amount: 0 },
      { payment_id: "s1", month_number: 3, year_number: 2026, payment_type: "suspension", payment_amount: 0 },
    ]);
  });

  it("pagos pendientes existentes pasan al nuevo estado sin aprobador", async () => {
    fake.setUser(ADMIN);
    fake.on("payment_detail", "select").reply({ data: { payment_id: "old" } }).reply({ data: { payment_id: "old" } });
    fake.on("payments", "insert").reply({ data: { id: "s1" } });

    expect(await service.crearPagoSuspendido("m1", meses, "Viaje", "aprobado")).toBe(2);
    const upd = fake.callsTo("payments", "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].payload).toEqual({
      status: "aprobado",
      payment_method: "efectivo",
      payment_note: "Viaje",
      approved_by: null,
      approved_at: null,
    });
    expect(upd[0].filters).toContainEqual(["eq", "id", "old"]);
    // Comportamiento actual preservado: el pago nuevo 'aprobado' no lleva aprobador.
    expect(fake.callsTo("payments", "insert")[0].payload).toMatchObject({ status: "aprobado", payment_note: "Viaje" });
  });

  it("falla la inserción del pago → 0 sin lanzar", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ error: { message: "x" } });
    expect(await service.crearPagoSuspendido("m1", meses)).toBe(0);
    expect(fake.callsTo("payment_detail", "insert")).toHaveLength(0);
  });

  it("falla la inserción de líneas → 0 sin lanzar", async () => {
    fake.setUser(ADMIN);
    fake.on("payments", "insert").reply({ data: { id: "s1" } });
    fake.on("payment_detail", "insert").reply({ error: { message: "x" } });
    expect(await service.crearPagoSuspendido("m1", meses)).toBe(0);
  });

  it("sin sesión → 'no autenticado'", async () => {
    await expect(service.crearPagoSuspendido("m1", meses)).rejects.toThrow(messages.toast.noAutenticado);
  });
});
