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

interface MetodoBody {
  payment_method: string;
  amount_monthly: number;
  amount_inscription: number;
  is_active: boolean;
}

function metodo(payment_method: string, is_active: boolean, monto = 5): MetodoBody {
  return { payment_method, amount_monthly: monto, amount_inscription: 10, is_active };
}

function req(metodos: MetodoBody[]) {
  return new Request("http://localhost/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: { gym_name: "CrossGym" }, metodos }),
  });
}

function preparar(role: "super_admin" | "miembro" = "super_admin") {
  authFake.setUser({ id: "admin-1", email: "owner@gym.com" });
  authFake.on("profiles", "select").reply({ data: { role } });
  serviceFake.on("gym_config", "select").reply({ data: { owner_email: "owner@gym.com" } });
  serviceFake.on("gym_config", "select").reply({ data: { id: "cfg1", owner_email: "owner@gym.com" } });
}

async function guardar(metodos: MetodoBody[]) {
  const { POST } = await import("@/app/api/config/route");
  const res = await POST(req(metodos));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  authFake = createSupabaseFake();
  serviceFake = createSupabaseFake();
});

describe("POST /api/config — guardado de métodos de pago", () => {
  it("inserta una fila versionada por cada método activo", async () => {
    preparar();
    // existe previa activa que debe desactivarse
    serviceFake.on("gym_config_payment_methods", "select").reply({
      data: [{ id: "m1", payment_method: "efectivo", is_active: true }],
    });

    const { status } = await guardar([
      metodo("efectivo", true),
      metodo("bs", true),
      metodo("binance", false),
    ]);

    expect(status).toBe(200);

    const inserts = serviceFake.callsTo("gym_config_payment_methods", "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts.map((c) => (c.payload as MetodoBody).payment_method).sort()).toEqual([
      "bs",
      "efectivo",
    ]);
    for (const c of inserts) {
      expect((c.payload as { is_active: boolean }).is_active).toBe(true);
      expect((c.payload as { effective_from: string }).effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // la fila previa activa queda desactivada con effective_to
    const updates = serviceFake.callsTo("gym_config_payment_methods", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ is_active: false });
    expect(updates[0].payload).toHaveProperty("effective_to");
  });

  it("un solo activo inserta exactamente una fila", async () => {
    preparar();
    serviceFake.on("gym_config_payment_methods", "select").reply({ data: [] });

    const { status } = await guardar([metodo("bs", true)]);

    expect(status).toBe(200);
    const inserts = serviceFake.callsTo("gym_config_payment_methods", "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as MetodoBody).payment_method).toBe("bs");
  });

  it("sin métodos activos no inserta nada (solo desactiva)", async () => {
    preparar();
    serviceFake.on("gym_config_payment_methods", "select").reply({
      data: [{ id: "m1", payment_method: "efectivo", is_active: true }],
    });

    const { status } = await guardar([metodo("efectivo", false), metodo("bs", false)]);

    expect(status).toBe(200);
    expect(serviceFake.callsTo("gym_config_payment_methods", "insert")).toHaveLength(0);
    expect(serviceFake.callsTo("gym_config_payment_methods", "update")).toHaveLength(1);
  });

  it("403 si el rol no es super_admin", async () => {
    preparar("miembro");

    const { status } = await guardar([metodo("efectivo", true)]);

    expect(status).toBe(403);
    expect(serviceFake.callsTo("gym_config_payment_methods", "insert")).toHaveLength(0);
  });
});

describe("POST /api/config — personalización de la app", () => {
  it("persiste colores y fuente en gym_config sin tocar campos de solo lectura", async () => {
    preparar();

    const { POST } = await import("@/app/api/config/route");
    const res = await POST(
      new Request("http://localhost/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            color_primario: "#22D3EE",
            color_secundario: "#A78BFA",
            color_fondo: "#082F49",
            color_fuente: "#F0F9FF",
            font_family: "Georgia, serif",
            id: "no-deberia-guardarse",
            created_at: "2026-01-01T00:00:00Z",
            updated_by: "admin-1",
          },
        }),
      })
    );

    expect(res.status).toBe(200);

    const updates = serviceFake.callsTo("gym_config", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      color_primario: "#22D3EE",
      color_secundario: "#A78BFA",
      color_fondo: "#082F49",
      color_fuente: "#F0F9FF",
      font_family: "Georgia, serif",
    });
    expect(updates[0].payload).not.toHaveProperty("id");
    expect(updates[0].payload).not.toHaveProperty("created_at");
    expect(updates[0].payload).not.toHaveProperty("updated_by");
  });

  it("acepta font_family null (reset a valores hardcodeados)", async () => {
    preparar();

    const { POST } = await import("@/app/api/config/route");
    const res = await POST(
      new Request("http://localhost/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { font_family: null } }),
      })
    );

    expect(res.status).toBe(200);
    const updates = serviceFake.callsTo("gym_config", "update");
    expect(updates[0].payload).toMatchObject({ font_family: null });
  });
});
