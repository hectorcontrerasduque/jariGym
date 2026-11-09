import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";

let authFake: SupabaseFake;
let serviceFake: SupabaseFake;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => authFake.client),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => serviceFake.client),
}));

const fetchMock = vi.fn();
const PROVEEDOR_OK = {
  ok: true,
  json: async () => ({ promedio: 897.5383, fechaActualizacion: "2026-11-09T00:00:00-04:00" }),
};

function haceHoras(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function rateLimitOk() {
  authFake.onRpc("increment_api_rate_limit").reply({
    data: [
      {
        success: true,
        limit_max: 10,
        remaining: 9,
        reset: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    error: null,
  });
}

function rateLimitAgotado() {
  authFake.onRpc("increment_api_rate_limit").reply({
    data: [
      {
        success: false,
        limit_max: 10,
        remaining: 0,
        reset: new Date(Date.now() + 30_000).toISOString(),
      },
    ],
    error: null,
  });
}

function reqPost(body: unknown = { forzar: false }) {
  return new Request("http://localhost/api/tasas/actualizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function get() {
  const { GET } = await import("@/app/api/tasas/route");
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

async function post(body: unknown = { forzar: false }) {
  const { POST } = await import("@/app/api/tasas/actualizar/route");
  const res = await POST(reqPost(body));
  return { status: res.status, body: await res.json(), headers: res.headers };
}

beforeEach(() => {
  authFake = createSupabaseFake();
  serviceFake = createSupabaseFake();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/tasas", () => {
  it("401 sin sesión", async () => {
    authFake.setUser(null);
    const { status } = await get();
    expect(status).toBe(401);
  });

  it("200 con sesión: últimas tasas + fuente", async () => {
    authFake.setUser({ id: "u1", email: "a@t.com" });
    authFake.on("exchange_rates", "select").reply({
      data: [{ id: 2, effective_at: "2026-11-09T04:00:00.000Z", rate_bs: 897.5383 }],
    });

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.tasas).toHaveLength(1);
    expect(body.tasas[0].rate_bs).toBe(897.5383);
    expect(body.fuente.nombre).toBe("DolarAPI Venezuela");
    expect(body.fuente.datos).toBe("BCV");
  });
});

describe("POST /api/tasas/actualizar", () => {
  it("401 sin sesión (y sin consumir rate limit)", async () => {
    authFake.setUser(null);
    const { status } = await post();
    expect(status).toBe(401);
    expect(authFake.calls.filter((c) => c.kind === "rpc")).toHaveLength(0);
  });

  it("429 cuando se supera el límite por usuario", async () => {
    authFake.setUser({ id: "u1", email: "a@t.com" });
    rateLimitAgotado();

    const { status, headers } = await post();

    expect(status).toBe(429);
    expect(headers.get("Retry-After")).toBeTruthy();
    expect(serviceFake.callsTo("exchange_rates")).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("automático con vigencia fresca: responde sin tocar al proveedor", async () => {
    authFake.setUser({ id: "u1", email: "a@t.com" });
    rateLimitOk();
    serviceFake.on("exchange_rates", "select").reply({
      data: { id: 1, effective_at: haceHoras(1), rate_bs: 900, created_at: haceHoras(1) },
    });
    serviceFake.on("exchange_rates", "select").reply({ data: [] });

    const { status, body } = await post({ forzar: false });

    expect(status).toBe(200);
    expect(body.actualizado).toBe(false);
    expect(body.motivo).toBe("vigente");
    expect(body.fuente.nombre).toBe("DolarAPI Venezuela");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(serviceFake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("forzar consulta al proveedor e inserta la tasa nueva", async () => {
    authFake.setUser({ id: "u1", email: "a@t.com" });
    rateLimitOk();
    serviceFake.on("exchange_rates", "select").reply({ data: null }); // ultima
    fetchMock.mockResolvedValue(PROVEEDOR_OK);
    serviceFake.on("exchange_rates", "select").reply({ data: null }); // existe
    serviceFake.on("exchange_rates", "select").reply({ data: [{ id: 1 }] }); // podar
    serviceFake.on("exchange_rates", "select").reply({ data: [{ id: 1, rate_bs: 897.5383 }] });

    const { status, body } = await post({ forzar: true });

    expect(status).toBe(200);
    expect(body.actualizado).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serviceFake.callsTo("exchange_rates", "insert")).toHaveLength(1);
  });

  it("proveedor caído: 200 fail-open con error (nunca 500)", async () => {
    authFake.setUser({ id: "u1", email: "a@t.com" });
    rateLimitOk();
    serviceFake.on("exchange_rates", "select").reply({ data: null });
    fetchMock.mockRejectedValue(new Error("network"));
    serviceFake.on("exchange_rates", "select").reply({ data: [] });

    const { status, body } = await post();

    expect(status).toBe(200);
    expect(body.actualizado).toBe(false);
    expect(body.motivo).toBe("error");
    expect(typeof body.error).toBe("string");
    expect(serviceFake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("cualquier rol autenticado puede actualizar (miembro incluido)", async () => {
    authFake.setUser({ id: "miembro-1", email: "miembro@t.com" });
    rateLimitOk();
    serviceFake.on("exchange_rates", "select").reply({
      data: { id: 1, effective_at: haceHoras(2), rate_bs: 900, created_at: haceHoras(2) },
    });
    serviceFake.on("exchange_rates", "select").reply({ data: [] });

    const { status, body } = await post();

    expect(status).toBe(200);
    expect(body.motivo).toBe("vigente");
  });
});
