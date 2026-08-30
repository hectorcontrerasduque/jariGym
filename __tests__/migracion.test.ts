import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {
    admin: {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      listUsers: vi.fn(),
      generateLink: vi.fn(),
    },
  },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/services/email/email.service", () => ({
  sendWelcomeEmail: vi.fn(),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/utils/sanitize", () => ({
  sanitizeOrFilter: vi.fn((words: string[]) => 
    words.map(w => `nombre.ilike.${w}%`).join(",")
  ),
}));

function chainReturn(data: unknown, error: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "ilike", "or", "in", "order", "limit",
    "maybeSingle", "single",
  ];
  for (const m of methods) {
    // eslint-disable-next-line security/detect-object-injection
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => void) => {
    if (error) reject(error);
    else resolve({ data, error });
    return chain;
  };
  return chain;
}

function chainReturnOnInsert(insertData: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "ilike", "or", "in", "order", "limit",
    "maybeSingle", "single",
  ];
  let isInsert = false;
  for (const m of methods) {
    if (m === "insert") {
      // eslint-disable-next-line security/detect-object-injection
      chain[m] = vi.fn(() => { isInsert = true; return chain; });
    } else if (m === "select") {
      // eslint-disable-next-line security/detect-object-injection
      chain[m] = vi.fn(() => chain);
    } else if (m === "single") {
      // eslint-disable-next-line security/detect-object-injection
      chain[m] = vi.fn(() => chain);
    } else {
      // eslint-disable-next-line security/detect-object-injection
      chain[m] = vi.fn(() => chain);
    }
  }
  chain.then = (resolve: (value: unknown) => void) => {
    resolve({ data: isInsert ? insertData : null, error: null });
    return chain;
  };
  return chain;
}

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/migracion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  nombreCompleto: "HAIDEE",
  phone_number: "1234",
  correo: "haidee@test.com",
  password: "123456",
};

describe("Migración API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falla si faltan campos obligatorios", { timeout: 15000 }, async () => {
    const req = makeReq({ nombreCompleto: "" });
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    await res.json();
    expect(res.status).toBe(400);
  });

  it("falla si email es inválido", async () => {
    const req = makeReq({ ...baseBody, correo: "noemail" });
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    await res.json();
    expect(res.status).toBe(400);
  });

  it("falla si password tiene menos de 6 caracteres", async () => {
    const req = makeReq({ ...baseBody, password: "12345" });
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    await res.json();
    expect(res.status).toBe(400);
  });

  it("falla si no hay gym_config", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn(null);
      return chainReturn(null);
    });

    const req = makeReq(baseBody);
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    await res.json();
    expect(res.status).toBe(400);
  });

  it("falla si no hay registros en tabla migracion", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "migracion") return chainReturn([]);
      return chainReturn(null);
    });

    const req = makeReq(baseBody);
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    await res.json();
    expect(res.status).toBe(404);
  });

  it("falla si nombre exacto ya fue migrado", async () => {
    let migracionCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "migracion") {
        migracionCallCount++;
        // 1st call: fuzzy search with migrado="no" → empty (no unmigrated records)
        // 2nd call: check migrado="si" → found (already migrated)
        if (migracionCallCount === 1) return chainReturn([]);
        return chainReturn([{ nombre: "HAIDEE" }]);
      }
      return chainReturn(null);
    });

    const req = makeReq(baseBody);
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    await res.json();
    expect(res.status).toBe(400);
  });

  it("exitoso: crea usuario + pagos + inscripcion", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "gym_config_payment_methods") return chainReturn({ amount_monthly: 10, amount_inscription: 5 });
      if (table === "migracion") return chainReturn([
        { id: "m1", nombre: "HAIDEE", mes_pagar: 1, anio_pagar: 2026, estado: "pagado", migrado: "no" },
        { id: "m2", nombre: "HAIDEE", mes_pagar: 2, anio_pagar: 2026, estado: "pagado", migrado: "no" },
      ]);
      if (table === "profiles") return chainReturn(null);
      if (table === "password_reset_tokens") return chainReturn(null);
      return chainReturn(null);
    });
    mockSupabase.rpc.mockResolvedValue({
      data: { pagos_creados: 2, pagos_actualizados: 0 },
      error: null,
    });
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });

    const req = makeReq(baseBody);
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const _body = await res.json();

    expect(res.status).toBe(200);
    expect(_body.success).toBe(true);
    expect(_body.pagosCreados).toBeGreaterThanOrEqual(1);
  });

  it("exitoso con selectedNombre diferente", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "gym_config_payment_methods") return chainReturn({ amount_monthly: 10, amount_inscription: 5 });
      if (table === "migracion") return chainReturn([
        { id: "m1", nombre: "HAIDEE LOPEZ", mes_pagar: 1, anio_pagar: 2026, estado: "pagado", migrado: "no" },
      ]);
      if (table === "profiles") return chainReturn(null);
      if (table === "password_reset_tokens") return chainReturn(null);
      return chainReturn(null);
    });
    mockSupabase.rpc.mockResolvedValue({
      data: { pagos_creados: 1, pagos_actualizados: 0 },
      error: null,
    });
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });

    const req = makeReq({ ...baseBody, selectedNombre: "HAIDEE LOPEZ" });
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const _body = await res.json();

    expect(res.status).toBe(200);
    expect(_body.success).toBe(true);
  });

  it("exitoso: usuario existente actualiza profile y pagos", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "gym_config_payment_methods") return chainReturn({ amount_monthly: 10, amount_inscription: 5 });
      if (table === "migracion") return chainReturn([
        { id: "m1", nombre: "HAIDEE", mes_pagar: 1, anio_pagar: 2026, estado: "pagado", migrado: "no" },
      ]);
      if (table === "profiles") return chainReturn({ id: "existing-user" });
      if (table === "password_reset_tokens") return chainReturn(null);
      return chainReturn(null);
    });
    mockSupabase.rpc.mockResolvedValue({
      data: { pagos_creados: 1, pagos_actualizados: 0 },
      error: null,
    });

    const req = makeReq(baseBody);
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const _body = await res.json();

    expect(res.status).toBe(200);
    expect(_body.success).toBe(true);
    expect(_body.existingUser).toBe(true);
  });

  it("solo procesa registros pagado y suspendido, no debe", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "gym_config") return chainReturn({ id: "1" });
      if (table === "gym_config_payment_methods") return chainReturn({ amount_monthly: 10, amount_inscription: 0 });
      if (table === "migracion") return chainReturn([
        { id: "m1", nombre: "HAIDEE", mes_pagar: 1, anio_pagar: 2026, estado: "pagado", migrado: "no" },
        { id: "m2", nombre: "HAIDEE", mes_pagar: 2, anio_pagar: 2026, estado: "debe", migrado: "no" },
        { id: "m3", nombre: "HAIDEE", mes_pagar: 3, anio_pagar: 2026, estado: "suspendido", migrado: "no" },
      ]);
      if (table === "profiles") return chainReturn(null);
      if (table === "password_reset_tokens") return chainReturn(null);
      return chainReturn(null);
    });
    mockSupabase.rpc.mockResolvedValue({
      data: { pagos_creados: 2, pagos_actualizados: 0 },
      error: null,
    });
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });

    const req = makeReq(baseBody);
    const { POST } = await import("@/app/api/migracion/route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    // pagado → aprobado, suspendido after pagado → suspendido, debe → skipped
    expect(body.pagosCreados).toBe(2);
  });
});
