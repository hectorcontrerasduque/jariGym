/**
 * dashboard-carga-unica: cargarDashboard() must return exactly what the dashboard
 * used to compute with getMiembrosElegibles() + stats() + monthlyStats(),
 * while calling get_pagos_por_anio once instead of three times.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseFake } from "./helpers/supabase-fake";
import { PagosService } from "@/lib/features/pagos/service";

interface Escenario {
  perfiles: unknown[];
  membresias: unknown[];
  metodo: unknown;
  config: unknown;
  pagos: unknown[];
}

function perfil(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, email: `${id}@t.com`, full_name: id.toUpperCase(), inscription_paid: true, activo: true,
    start_date: "2026-01-01", avatar_url: null, role: "miembro", inscription_admin_note: null,
    arrival_time: null, departure_time: null, ...overrides,
  };
}

function pago(user_id: string, month_number: number | null, overrides: Record<string, unknown> = {}) {
  return {
    id: `p-${user_id}-${month_number}`, user_id, status: "aprobado", payment_note: null, payment_method: "efectivo",
    bill_code: null, receipt_url: null, created_at: "2026-01-01T00:00:00Z", month_number, year_number: 2026,
    payment_amount: 25, payment_type: "mensualidad", ...overrides,
  };
}

function queueElegibles(fake: ReturnType<typeof createSupabaseFake>, e: Escenario) {
  fake.on("profiles", "select").reply({ data: e.perfiles });
  fake.on("gym_config_payment_methods", "select").reply({ data: e.metodo });
  fake.on("memberships", "select").reply({ data: e.membresias });
  fake.on("gym_config", "select").reply({ data: e.config });
}

/** What app/dashboard/page.tsx did before this change. */
async function caminoAnterior(e: Escenario, anio: number) {
  const fake = createSupabaseFake();
  queueElegibles(fake, e);
  fake.onRpc("get_pagos_por_anio").reply({ data: e.pagos }).reply({ data: e.pagos }).reply({ data: e.pagos });
  const service = new PagosService(fake.client);
  const elegibles = await service.getMiembrosElegibles();
  const [stats, monthlyStats] = await Promise.all([
    service.stats(anio, undefined, elegibles),
    service.monthlyStats(anio, undefined, elegibles),
  ]);
  return { resultado: { elegibles, stats, monthlyStats }, rpcs: fake.calls.filter((c) => c.kind === "rpc").length };
}

async function caminoNuevo(e: Escenario, anio: number) {
  const fake = createSupabaseFake();
  queueElegibles(fake, e);
  fake.onRpc("get_pagos_por_anio").reply({ data: e.pagos });
  const resultado = await new PagosService(fake.client).cargarDashboard(anio);
  return { resultado, rpcs: fake.calls.filter((c) => c.kind === "rpc").length };
}

const base: Escenario = {
  metodo: { amount_monthly: 25, amount_inscription: 40 },
  config: { owner_email: "Dueno@t.com", billing_mode: "dia_uno" },
  membresias: [
    { user_id: "libre", start_date: null },
    { user_id: "futuro", start_date: "2026-12-01" },
  ],
  perfiles: [
    perfil("dueno", { role: "super_admin" }),
    perfil("aldia"),
    perfil("deudor", { inscription_paid: false, start_date: "2026-06-15" }),
    perfil("libre"),
    perfil("futuro", { start_date: "2026-04-01" }),
    perfil("nuevo", { start_date: null }),
    perfil("inactivo", { activo: false }),
    perfil("pendiente", { start_date: "2026-08-01" }),
  ],
  pagos: [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => pago("aldia", m)),
    pago("deudor", 6),
    pago("pendiente", 8),
    pago("pendiente", 9, { status: "pendiente", payment_amount: 0 }),
    pago("nuevo", null, { payment_type: "inscripcion", payment_amount: 40 }),
    pago("nuevo", 3, { payment_type: "suspension", payment_amount: 0 }),
    pago("externo", 5, { payment_amount: 7 }),
    pago("aldia", 10, { status: "rechazado" }),
  ],
};

const escenarios: Array<[string, Escenario, number]> = [
  ["mixto (dueño, al día, deudor, libre, membresía futura, pendientes, externos)", base, 2026],
  ["año anterior", { ...base, pagos: base.pagos.map((p) => ({ ...(p as object), year_number: 2025 })) }, 2025],
  ["modo fecha_inscripcion con día de cobro posterior a hoy", { ...base, config: { owner_email: "dueno@t.com", billing_mode: "fecha_inscripcion" } }, 2026],
  ["sin miembros", { ...base, perfiles: [] }, 2026],
  ["sin config ni método de pago", { ...base, metodo: null, config: null }, 2026],
];

describe("cargarDashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 12, 12));
  });
  afterEach(() => vi.useRealTimers());

  it.each(escenarios)("equivale a elegibles + stats + monthlyStats: %s", async (_nombre, escenario, anio) => {
    const anterior = await caminoAnterior(escenario, anio);
    const nuevo = await caminoNuevo(escenario, anio);
    expect(nuevo.resultado).toEqual(anterior.resultado);
  });

  it("descarga el RPC del año 1 vez (antes 3)", async () => {
    expect((await caminoAnterior(base, 2026)).rpcs).toBe(3);
    expect((await caminoNuevo(base, 2026)).rpcs).toBe(1);
  });

  it("lanza el RPC y las 4 consultas de elegibles en paralelo, antes de esperar respuestas", async () => {
    const fake = createSupabaseFake();
    queueElegibles(fake, base);
    fake.onRpc("get_pagos_por_anio").reply({ data: base.pagos });
    const pendiente = new PagosService(fake.client).cargarDashboard(2026);

    expect(fake.calls.map((c) => c.table).sort()).toEqual(
      ["get_pagos_por_anio", "gym_config", "gym_config_payment_methods", "memberships", "profiles"]
    );
    await pendiente;
    expect(fake.calls).toHaveLength(5);
  });

  it("usa el año actual por defecto", async () => {
    const fake = createSupabaseFake();
    queueElegibles(fake, base);
    await new PagosService(fake.client).cargarDashboard();
    expect(fake.calls.find((c) => c.kind === "rpc")?.payload).toEqual({ p_anio: 2026 });
  });
});
