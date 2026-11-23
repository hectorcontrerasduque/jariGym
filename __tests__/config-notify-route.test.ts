import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";

let authFake: SupabaseFake;
let serviceFake: SupabaseFake;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => authFake.client),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => serviceFake.client),
}));

vi.mock("@/lib/services/email/email.service", () => ({
  sendConfiguracionDuenoEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/features/push/service", () => ({
  enviarPushAUsuarios: vi.fn(async () => ({ enviados: 1, fallos: 0, omitido: null })),
}));

import { sendConfiguracionDuenoEmail } from "@/lib/services/email/email.service";
import { enviarPushAUsuarios } from "@/lib/features/push/service";

const CONFIG = {
  owner_email: "dueno@gym.com",
  owner_name: "Ana Dueña",
  gym_name: "CrossGym",
  logo_url: "https://cdn/logo.png",
};

function req(body: unknown) {
  return new Request("http://localhost/api/config/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function preparar(role: "super_admin" | "miembro" = "super_admin") {
  authFake.setUser({ id: "admin-1", email: "owner@gym.com" });
  authFake.on("profiles", "select").reply({ data: { role } });
  authFake.onRpc("increment_api_rate_limit").reply({ data: [{ success: true }] });
}

function prepararDueno() {
  serviceFake.on("gym_config", "select").reply({ data: CONFIG });
  serviceFake.on("profiles", "select").reply({ data: { id: "owner-1" } });
}

async function notificar(body: unknown) {
  const { POST } = await import("@/app/api/config/notify/route");
  const res = await POST(req(body));
  return { status: res.status, body: await res.json() };
}

describe("POST /api/config/notify", () => {
  beforeEach(() => {
    authFake = createSupabaseFake();
    serviceFake = createSupabaseFake();
    vi.mocked(sendConfiguracionDuenoEmail).mockClear();
    vi.mocked(enviarPushAUsuarios).mockClear();
  });

  beforeAll(async () => {
    await import("@/app/api/config/notify/route");
  }, 30_000);

  it("401 sin sesión", async () => {
    authFake.setUser(null);
    const { status } = await notificar({ creado: true, cambios: [] });
    expect(status).toBe(401);
  });

  it("403 si no es super_admin", async () => {
    preparar("miembro");
    const { status } = await notificar({ creado: true, cambios: [] });
    expect(status).toBe(403);
    expect(sendConfiguracionDuenoEmail).not.toHaveBeenCalled();
  });

  it("sin cambios ni creación no notifica", async () => {
    preparar();
    const { status, body } = await notificar({ creado: false, cambios: [] });
    expect(status).toBe(200);
    expect(body.notificado).toBe(false);
    expect(sendConfiguracionDuenoEmail).not.toHaveBeenCalled();
    expect(enviarPushAUsuarios).not.toHaveBeenCalled();
  });

  it("al crearse: correo de bienvenida y push al propietario", async () => {
    preparar();
    prepararDueno();

    const { status, body } = await notificar({
      creado: true,
      cambios: [{ campo: "owner_email", anterior: "", nuevo: "dueno@gym.com" }],
    });

    expect(status).toBe(200);
    expect(body.notificado).toBe(true);
    expect(sendConfiguracionDuenoEmail).toHaveBeenCalledWith(
      "dueno@gym.com",
      "Ana Dueña",
      "CrossGym",
      "bienvenida",
      [{ campo: "owner_email", anterior: "", nuevo: "dueno@gym.com" }],
      "https://cdn/logo.png"
    );
    const [cliente, ids, payload] = vi.mocked(enviarPushAUsuarios).mock.calls[0];
    expect(cliente).toBe(serviceFake.client);
    expect(ids).toEqual(["owner-1"]);
    expect(payload.url).toBe("/dashboard/configuracion");
    expect(payload.title).toContain("CrossGym");
  });

  it("al modificarse: correo de actualización y push", async () => {
    preparar();
    prepararDueno();

    const { status } = await notificar({
      creado: false,
      cambios: [{ campo: "owner_phone", anterior: "04140000000", nuevo: "04141111111" }],
    });

    expect(status).toBe(200);
    expect(sendConfiguracionDuenoEmail).toHaveBeenCalledWith(
      "dueno@gym.com",
      "Ana Dueña",
      "CrossGym",
      "actualizacion",
      [{ campo: "owner_phone", anterior: "04140000000", nuevo: "04141111111" }],
      "https://cdn/logo.png"
    );
    expect(enviarPushAUsuarios).toHaveBeenCalledTimes(1);
  });

  it("400 si no hay owner_email configurado", async () => {
    preparar();
    serviceFake.on("gym_config", "select").reply({
      data: { owner_email: "", owner_name: "", gym_name: "X", logo_url: null },
    });

    const { status } = await notificar({ creado: true, cambios: [] });
    expect(status).toBe(400);
    expect(sendConfiguracionDuenoEmail).not.toHaveBeenCalled();
  });
});
