import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { applyRateLimit, getClientIp } from "@/lib/middleware/rate-limit";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ 
      data: [{ success: true, limit_max: 5, remaining: 4, reset: new Date(Date.now() + 60000).toISOString() }],
      error: null 
    }),
  })),
}));

function createMockRequest(init: { ip?: string; realIp?: string } = {}) {
  const headers = new Headers();
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  if (init.realIp) headers.set("x-real-ip", init.realIp);
  return new NextRequest("http://localhost/api/test", { 
    method: "POST",
    headers 
  });
}

describe("applyRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite requests bajo límite", async () => {
    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = await applyRateLimit(req, { max: 5, windowMs: 60000 });
    expect(result).toBeNull();
  });

  it("usa customKey (user_id) cuando se provee", async () => {
    const req = createMockRequest({ ip: "192.168.1.1" });
    await applyRateLimit(req, { max: 5, windowMs: 60000 }, "user-123");
  });
});

describe("getClientIp", () => {
  it("extrae primera IP de x-forwarded-for", () => {
    const req = createMockRequest({ ip: "10.0.0.1, 192.168.1.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });
  it("usa x-real-ip si no hay forwarded", () => {
    const req = new NextRequest("http://localhost", { 
      headers: new Headers({ "x-real-ip": "192.168.1.50" })
    });
    expect(getClientIp(req)).toBe("192.168.1.50");
  });
  it("fallback anonymous", () => {
    const req = new NextRequest("http://localhost");
    expect(getClientIp(req)).toBe("anonymous");
  });
});