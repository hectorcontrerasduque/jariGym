import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";

let authFake: SupabaseFake;
let serviceFake: SupabaseFake;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => authFake.client),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => serviceFake.client),
}));

vi.mock("@/lib/features/pagos/inscription-amount", () => ({
  calcularMontoInscripcionAprobado: vi.fn(async () => 25),
}));

const PAGO_ID = "pago-1";
const MIEMBRO_ID = "miembro-1";

function makeReq(id: string = PAGO_ID) {
  return new Request(`http://localhost/api/pagos?id=${id}`, { method: "DELETE" });
}

interface Escenario {
  rol: "super_admin" | "miembro";
  pago: { status: string; user_id: string };
  ultimoId: string;
  detalles?: { payment_type: string }[];
  otroInscripcion?: { id: string }[] | null;
  detalleOtro?: { id: string }[];
}

function preparar({ rol, pago, ultimoId, detalles, otroInscripcion, detalleOtro }: Escenario) {
  authFake.setUser({ id: rol === "miembro" ? MIEMBRO_ID : "admin-1" });
  authFake.on("profiles", "select").reply({ data: { role: rol } });

  serviceFake.on("payments", "select").reply({ data: pago });
  serviceFake.on("payments", "select").reply({
    data: ultimoId === PAGO_ID ? { id: PAGO_ID } : { id: ultimoId },
  });

  if (detalles !== undefined) {
    serviceFake.on("payment_detail", "select").reply({ data: detalles });
    serviceFake.on("payments", "delete").reply({ error: null });
    if (otroInscripcion !== undefined) {
      serviceFake.on("payments", "select").reply({ data: otroInscripcion });
      if (detalleOtro !== undefined) {
        serviceFake.on("payment_detail", "select").reply({ data: detalleOtro });
      }
    }
    serviceFake.on("profiles", "update").reply({ error: null });
  }
}

async function borrar(id: string = PAGO_ID) {
  const { DELETE } = await import("@/app/api/pagos/route");
  const res = await DELETE(makeReq(id));
  const body = await res.json();
  return { status: res.status, body };
}

describe("DELETE /api/pagos", () => {
  beforeEach(() => {
    authFake = createSupabaseFake();
    serviceFake = createSupabaseFake();
  });

  it("super_admin borra su último registro pendiente", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "pendiente", user_id: "admin-1" },
      ultimoId: PAGO_ID,
      detalles: [{ payment_type: "mensualidad" }],
    });

    const { status } = await borrar();

    expect(status).toBe(200);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(1);
  });

  it("super_admin borra el último registro aprobado", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "aprobado", user_id: MIEMBRO_ID },
      ultimoId: PAGO_ID,
      detalles: [{ payment_type: "mensualidad" }],
    });

    const { status } = await borrar();

    expect(status).toBe(200);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(1);
  });

  it("super_admin borra el último registro rechazado (cualquier estatus)", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "rechazado", user_id: MIEMBRO_ID },
      ultimoId: PAGO_ID,
      detalles: [{ payment_type: "mensualidad" }],
    });

    const { status } = await borrar();

    expect(status).toBe(200);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(1);
  });

  it("super_admin NO borra un registro que no es el último", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "aprobado", user_id: MIEMBRO_ID },
      ultimoId: "pago-2",
    });

    const { status } = await borrar();

    expect(status).toBe(403);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(0);
  });

  it("super_admin NO borra un pendiente antiguo", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "pendiente", user_id: MIEMBRO_ID },
      ultimoId: "pago-2",
    });

    const { status } = await borrar();

    expect(status).toBe(403);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(0);
  });

  it("miembro borra su último registro pendiente", async () => {
    preparar({
      rol: "miembro",
      pago: { status: "pendiente", user_id: MIEMBRO_ID },
      ultimoId: PAGO_ID,
      detalles: [{ payment_type: "mensualidad" }],
    });

    const { status } = await borrar();

    expect(status).toBe(200);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(1);
  });

  it("miembro NO borra un pendiente que no es el último", async () => {
    preparar({
      rol: "miembro",
      pago: { status: "pendiente", user_id: MIEMBRO_ID },
      ultimoId: "pago-2",
    });

    const { status } = await borrar();

    expect(status).toBe(403);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(0);
  });

  it("miembro NO borra su último registro aprobado", async () => {
    preparar({
      rol: "miembro",
      pago: { status: "aprobado", user_id: MIEMBRO_ID },
      ultimoId: PAGO_ID,
    });

    const { status } = await borrar();

    expect(status).toBe(403);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(0);
  });

  it("miembro NO borra un pago ajeno", async () => {
    preparar({
      rol: "miembro",
      pago: { status: "pendiente", user_id: "otro-miembro" },
      ultimoId: PAGO_ID,
    });

    const { status } = await borrar();

    expect(status).toBe(403);
    expect(serviceFake.callsTo("payments", "delete")).toHaveLength(0);
  });

  it("resetea la inscripción cuando no queda otra aprobada", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "aprobado", user_id: MIEMBRO_ID },
      ultimoId: PAGO_ID,
      detalles: [{ payment_type: "inscripcion" }],
      otroInscripcion: [],
    });

    const { status } = await borrar();

    expect(status).toBe(200);
    const update = serviceFake.callsTo("profiles", "update")[0];
    expect(update.payload).toEqual({
      inscription_paid: false,
      inscription_date: null,
      inscription_amount_paid: 0,
    });
  });

  it("recalcula el monto de inscripción cuando queda otra aprobada", async () => {
    preparar({
      rol: "super_admin",
      pago: { status: "aprobado", user_id: MIEMBRO_ID },
      ultimoId: PAGO_ID,
      detalles: [{ payment_type: "inscripcion" }],
      otroInscripcion: [{ id: "pago-otro" }],
      detalleOtro: [{ id: "detalle-1" }],
    });

    const { status } = await borrar();

    expect(status).toBe(200);
    const update = serviceFake.callsTo("profiles", "update")[0];
    expect(update.payload).toEqual({ inscription_amount_paid: 25 });
  });

  it("401 sin sesión", async () => {
    authFake.setUser(null);

    const { status } = await borrar();

    expect(status).toBe(401);
  });

  it("404 si el pago no existe", async () => {
    authFake.setUser({ id: "admin-1" });
    authFake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    serviceFake.on("payments", "select").reply({ data: null });

    const { status } = await borrar();

    expect(status).toBe(404);
  });
});
