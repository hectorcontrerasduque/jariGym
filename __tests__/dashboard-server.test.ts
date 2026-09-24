import { describe, it, expect } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { consultarDashboard, mapearMiembros } from "@/lib/features/dashboard/carga";
import { filtrarElegibles } from "@/lib/features/pagos/domain/elegibles";

const perfilRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id, email: `${id}@t.com`, full_name: id, inscription_paid: true, activo: true, start_date: "2026-01-01",
  avatar_url: null, role: "miembro", inscription_admin_note: null, arrival_time: "07:00", departure_time: "08:00", ...extra,
});

/** Queues replies in the order consultarDashboard builds its queries. */
function preparar(fake: SupabaseFake, role: "super_admin" | "miembro") {
  fake.setUser({ id: "u1", email: "u1@t.com" });
  // The fake serves replies in await order: consultarElegibles awaits its queries
  // (inside the outer Promise.all) before the outer await reaches the own-profile query.
  fake.on("profiles", "select")
    .reply({ data: [perfilRow("u1"), perfilRow("u2")] }) // elegibles
    .reply({ data: { role, arrival_time: "07:00", departure_time: "08:00", full_name: "U1", email: "u1@t.com" } }); // own profile
  fake.on("gym_config_payment_methods", "select").reply({ data: { amount_monthly: 25, amount_inscription: 40 } });
  fake.on("memberships", "select").reply({ data: [] });
  fake.on("gym_config", "select")
    .reply({ data: { owner_email: "dueno@t.com", billing_mode: "dia_uno" } }) // elegibles config
    .reply({ data: { id: "cfg", gym_name: "Gym", owner_email: "dueno@t.com" } }); // full config
  fake.onRpc("get_pagos_por_anio").reply({ data: [{ id: "p1", user_id: "u2", status: "aprobado", month_number: 9, year_number: 2026, payment_amount: 25, payment_type: "mensualidad" }] });
  fake.on("payment_detail", "select").reply({ data: [{ year_number: 2025 }, { year_number: 2026 }] }); // aniosConPagos
}

describe("consultarDashboard", () => {
  it("sin sesión → null, sin consultar datos", async () => {
    const fake = createSupabaseFake();
    expect(await consultarDashboard(fake.client, 2026)).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it("admin: datos crudos completos, sin pendientes propios", async () => {
    const fake = createSupabaseFake();
    preparar(fake, "super_admin");
    fake.on("payments", "select").reply({ data: [{ id: "r1", detail: [] }] }); // recientes

    const raw = await consultarDashboard(fake.client, 2026);
    expect(raw).toMatchObject({
      anio: 2026,
      user: { id: "u1", email: "u1@t.com" },
      profile: { role: "super_admin", full_name: "U1" },
      elegiblesInput: {
        perfiles: [perfilRow("u1"), perfilRow("u2")],
        metodoPago: { amount_monthly: 25, amount_inscription: 40 },
        membresias: [],
        gymConfig: { owner_email: "dueno@t.com", billing_mode: "dia_uno" },
      },
      pagosRecientes: [{ id: "r1", detail: [] }],
      anios: [2026, 2025],
      gymConfig: { id: "cfg", gym_name: "Gym" },
      misPagosPendientes: null,
    });
    expect(raw!.pagosDelAnio).toHaveLength(1);
    expect(fake.calls.find((c) => c.kind === "rpc")?.payload).toEqual({ p_anio: 2026 });
    // Only the "recientes" query hits payments for an admin
    expect(fake.callsTo("payments")).toHaveLength(1);
  });

  it("miembro: cuenta sus pagos pendientes", async () => {
    const fake = createSupabaseFake();
    preparar(fake, "miembro");
    fake.on("payments", "select")
      .reply({ data: [] }) // recientes
      .reply({ data: [{ id: "a" }, { id: "b" }] }); // own pending

    const raw = await consultarDashboard(fake.client, 2026);
    expect(raw?.misPagosPendientes).toBe(2);
    const propios = fake.callsTo("payments")[1];
    expect(propios.filters).toContainEqual(["eq", "user_id", "u1"]);
    expect(propios.filters).toContainEqual(["eq", "status", "pendiente"]);
  });

  it("cualquier error → null (nunca rechaza)", async () => {
    const fake = createSupabaseFake();
    preparar(fake, "super_admin");
    fake.onRpc("get_pagos_por_anio").reply({ error: { message: "boom" } });
    // Replace the queued RPC success with a failure: drain the first reply
    await fake.client.rpc("get_pagos_por_anio");
    await expect(consultarDashboard(fake.client, 2026)).resolves.toBeNull();
  });
});

describe("mapearMiembros", () => {
  it("mapea los elegibles al Profile que usa el dashboard", () => {
    const elegibles = filtrarElegibles(
      { perfiles: [perfilRow("a", { full_name: null, start_date: null, role: null })], metodoPago: null, membresias: [], gymConfig: null },
      new Date(2026, 8, 12)
    );
    expect(mapearMiembros(elegibles)).toEqual([
      {
        id: "a", email: "a@t.com", full_name: "", avatar_url: null, activo: true, role: "miembro", start_date: "",
        inscription_admin_note: null, inscription_paid: true, arrival_time: "07:00", departure_time: "08:00",
      },
    ]);
  });
});
