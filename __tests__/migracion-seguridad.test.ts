import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { NextRequest } from "next/server";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";

let authFake: SupabaseFake;
let serviceFake: SupabaseFake;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => authFake.client),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => serviceFake.client),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

function reqMorosos(anio = 2026) {
  return {
    nextUrl: new URL(`http://localhost/api/migracion/morosos?anio=${anio}`),
  } as unknown as NextRequest;
}

describe("seguridad de los endpoints de migración", () => {
  beforeEach(() => {
    authFake = createSupabaseFake();
    serviceFake = createSupabaseFake();
  });

  beforeAll(async () => {
    await import("@/app/api/migracion/morosos/route");
    await import("@/app/api/migracion/list/route");
    await import("@/app/api/migracion/ping/route");
  }, 30_000);

  describe("GET /api/migracion/morosos", () => {
    it("responde 401 sin sesión", async () => {
      const { GET } = await import("@/app/api/migracion/morosos/route");
      const res = await GET(reqMorosos());

      expect(res.status).toBe(401);
      expect(serviceFake.callsTo("migracion")).toHaveLength(0);
    });

    it("responde 403 si el usuario no es super_admin", async () => {
      authFake.setUser({ id: "miembro-1" });
      authFake.on("profiles", "select").reply({ data: { role: "miembro" } });

      const { GET } = await import("@/app/api/migracion/morosos/route");
      const res = await GET(reqMorosos());

      expect(res.status).toBe(403);
      expect(serviceFake.callsTo("migracion")).toHaveLength(0);
    });

    it("responde 200 con sesión de super_admin", async () => {
      authFake.setUser({ id: "admin-1" });
      authFake.on("profiles", "select").reply({ data: { role: "super_admin" } });
      serviceFake.on("gym_config_payment_methods", "select").reply({
        data: [{ payment_method: "efectivo", amount_monthly: 10 }],
      });
      serviceFake.on("migracion", "select").reply({
        data: [{ nombre: "ANA", correo: "ana@x.com", mes_pagar: 1, anio_pagar: 2026, estado: "debe" }],
      });

      const { GET } = await import("@/app/api/migracion/morosos/route");
      const res = await GET(reqMorosos());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.morosos).toHaveLength(1);
      expect(body.morosos[0]).toMatchObject({ full_name: "ANA", totalDeuda: 10 });
    });
  });

  describe("GET /api/migracion/list", () => {
    it("no expone los correos de los miembros", async () => {
      serviceFake.on("migracion", "select").reply({
        data: [{ nombre: "ana", correo: "ana@x.com", migrado: "no" }],
      });

      const { GET } = await import("@/app/api/migracion/list/route");
      const res = await GET(new Request("http://localhost/api/migracion/list"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.records).toEqual([{ nombre: "ANA", migrado: "no" }]);
    });
  });

  describe("GET /api/migracion/ping", () => {
    it("no expone el nombre del perfil", async () => {
      serviceFake.on("profiles", "select").reply({ data: { id: "u1" } });
      serviceFake.on("migracion", "select").reply({ data: null });

      const { GET } = await import("@/app/api/migracion/ping/route");
      const res = await GET(
        new Request("http://localhost/api/migracion/ping?email=ana@x.com")
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ exists: true, alreadyMigrated: false });
      expect(body.nombre).toBeUndefined();
    });
  });
});
