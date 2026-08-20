import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  from: vi.fn(),
  auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn(), listUsers: vi.fn(), generateLink: vi.fn() } },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/services/email/email.service", () => ({
  sendWelcomeEmail: vi.fn(),
}));

function chainReturn(data: unknown, error: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "insert", "update", "delete", "eq", "ilike", "or", "in", "order", "limit", "maybeSingle", "single"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: Function, reject: Function) => {
    if (error) reject(error);
    else resolve({ data, error });
    return chain;
  };
  return chain;
}

describe("Migración API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falla si no hay gym_config", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn(null);
      return chainReturn(null);
    });

    const req = new Request("http://localhost/api/migracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombreCompleto: "HAIDEE",
        whatsapp: "1234",
        correo: "haidee@test.com",
        password: "123456",
      }),
    });

    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("configuración");
  });

  it("falla si no hay registros en tabla migracion", async () => {
    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "migracion") return chainReturn([]);
      return chainReturn(null);
    });

    const req = new Request("http://localhost/api/migracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombreCompleto: "HAIDEE",
        whatsapp: "1234",
        correo: "haidee@test.com",
        password: "123456",
      }),
    });

    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("No se encontraron");
  });

  it("falla si email ya existe como auth user", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "migracion") return chainReturn([{ id: "1", nombre: "HAIDEE", mes_pagar: 1, anio_pagar: 2026, estado: "pagado", migrado: "no" }]);
      if (table === "profiles") return chainReturn(null);
      return chainReturn(null);
    });
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: null,
      error: { message: "User already exists" },
    });

    const req = new Request("http://localhost/api/migracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombreCompleto: "HAIDEE",
        whatsapp: "1234",
        correo: "haidee@test.com",
        password: "123456",
      }),
    });

    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("registrado");
  });

  it("exitoso: crea usuario + pagos + inscripcion", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "gym_config_metodos_pago") return chainReturn({ monto_mensual: 10, monto_inscripcion: 5 });
      if (table === "migracion") return chainReturn([
        { id: "m1", nombre: "HAIDEE", mes_pagar: 1, anio_pagar: 2026, estado: "pagado", migrado: "no" },
        { id: "m2", nombre: "HAIDEE", mes_pagar: 2, anio_pagar: 2026, estado: "pagado", migrado: "no" },
      ]);
      if (table === "profiles") return chainReturn(null);
      if (table === "pagos") return chainReturn(null);
      return chainReturn(null);
    });
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const req = new Request("http://localhost/api/migracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombreCompleto: "HAIDEE",
        whatsapp: "1234",
        correo: "haidee@test.com",
        password: "123456",
      }),
    });

    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pagosCreados).toBeGreaterThanOrEqual(1);
  });
});
