import { describe, it, expect, beforeEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { recalcularInscripcion } from "@/lib/features/pagos/inscripcion";

let fake: SupabaseFake;

function fila(overrides: Record<string, unknown> = {}) {
  return {
    month_number: 1,
    year_number: 2026,
    payment_type: "inscripcion",
    payment_amount: 25,
    expected_amount_usd: 50,
    payments: { status: "aprobado", payment_method: "bs", created_at: "2026-01-01T00:00:00Z" },
    ...overrides,
  };
}

function config(inscripcion: number) {
  return [{ payment_method: "bs", amount_monthly: 30, amount_inscription: inscripcion }];
}

describe("recalcularInscripcion", () => {
  beforeEach(() => {
    fake = createSupabaseFake();
  });

  it("dos abonos parciales de meses distintos cubren la inscripción con precio congelado", async () => {
    // Precio congelado 50; la config actual subió a 60 y aun así debe quedar cubierta.
    fake.on("payment_detail", "select").reply({ data: [fila(), fila({ month_number: 2 })] });
    fake.on("gym_config_payment_methods", "select").reply({ data: config(60) });

    const r = await recalcularInscripcion(fake.client, "u1");

    expect(r).toEqual({ cubierta: true, montoPagado: 50 });
    const [upd] = fake.callsTo("profiles", "update");
    expect(upd.payload).toMatchObject({
      inscription_paid: true,
      inscription_amount_paid: 50,
    });
    expect(upd.filters).toContainEqual(["eq", "id", "u1"]);
  });

  it("un abono parcial no cubre la inscripción", async () => {
    fake.on("payment_detail", "select").reply({ data: [fila({ payment_amount: 20 })] });
    fake.on("gym_config_payment_methods", "select").reply({ data: config(50) });

    const r = await recalcularInscripcion(fake.client, "u1");

    expect(r.cubierta).toBe(false);
    const [upd] = fake.callsTo("profiles", "update");
    expect(upd.payload).toMatchObject({ inscription_paid: false, inscription_amount_paid: 20 });
  });

  it("los pagos pendientes no cuentan para cubrir la inscripción", async () => {
    fake.on("payment_detail", "select").reply({
      data: [fila({ payments: { status: "pendiente", payment_method: "bs", created_at: "2026-01-01T00:00:00Z" } })],
    });
    fake.on("gym_config_payment_methods", "select").reply({ data: config(50) });

    const r = await recalcularInscripcion(fake.client, "u1");

    expect(r.cubierta).toBe(false);
  });

  it("sin pagos de inscripción deja el flag en false", async () => {
    fake.on("payment_detail", "select").reply({ data: [] });
    fake.on("gym_config_payment_methods", "select").reply({ data: config(50) });

    const r = await recalcularInscripcion(fake.client, "u1");

    expect(r).toEqual({ cubierta: false, montoPagado: 0 });
    const [upd] = fake.callsTo("profiles", "update");
    expect(upd.payload).toMatchObject({ inscription_paid: false, inscription_date: null });
  });
});
