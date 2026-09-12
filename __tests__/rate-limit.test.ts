import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { applyRateLimit, getClientIp } from "@/lib/middleware/rate-limit";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        lt: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
  })),
}));

function createMockRequest(init: { ip?: string; realIp?: string } = {}) {
  const headers = new Headers();
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  if (init.realIp) headers.set("x-real-ip", init.realIp);
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers,
  });
}

describe("applyRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("permite requests bajo límite", async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: true, limit_max: 5, remaining: 4, reset: new Date(Date.now() + 60000).toISOString() }],
      error: null,
    });

    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = await applyRateLimit(req, { max: 5, windowMs: 60000 });
    expect(result).toBeNull();
  });

  it("retorna 429 cuando excede el límite", async () => {
    const resetTime = new Date(Date.now() + 30000).toISOString();
    mockRpc.mockResolvedValue({
      data: [{ success: false, limit_max: 5, remaining: 0, reset: resetTime }],
      error: null,
    });

    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = await applyRateLimit(req, { max: 5, windowMs: 60000 });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);

    const body = await result!.json();
    expect(body.error).toContain("Demasiadas peticiones");

    const retryAfter = result!.headers.get("Retry-After");
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const remaining = result!.headers.get("X-RateLimit-Remaining");
    expect(remaining).toBe("0");

    const limit = result!.headers.get("X-RateLimit-Limit");
    expect(limit).toBe("5");
  });

  it("retorna null si RPC falla (fail-open)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });

    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = await applyRateLimit(req, { max: 5, windowMs: 60000 });
    expect(result).toBeNull();
  });

  it("usa customKey cuando se provee", async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: true, limit_max: 5, remaining: 4, reset: new Date(Date.now() + 60000).toISOString() }],
      error: null,
    });

    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = await applyRateLimit(req, { max: 5, windowMs: 60000 }, "user-123");
    expect(result).toBeNull();

    const rpcCall = mockRpc.mock.calls[0];
    const key = rpcCall[1].p_key;
    expect(key).toContain("user-123");
  });

  it("usa prefix personalizado", async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: true, limit_max: 10, remaining: 9, reset: new Date(Date.now() + 60000).toISOString() }],
      error: null,
    });

    const req = createMockRequest({ ip: "10.0.0.1" });
    await applyRateLimit(req, { max: 10, windowMs: 60000, prefix: "auth" });

    const rpcCall = mockRpc.mock.calls[0];
    const key = rpcCall[1].p_key;
    expect(key).toContain("auth");
  });
});

describe("getClientIp", () => {
  it("extrae primera IP de x-forwarded-for", () => {
    const req = createMockRequest({ ip: "10.0.0.1, 192.168.1.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("usa x-real-ip si no hay forwarded", () => {
    const req = new NextRequest("http://localhost", {
      headers: new Headers({ "x-real-ip": "192.168.1.50" }),
    });
    expect(getClientIp(req)).toBe("192.168.1.50");
  });

  it("fallback anonymous cuando no hay headers", () => {
    const req = new NextRequest("http://localhost");
    expect(getClientIp(req)).toBe("anonymous");
  });

  it("x-forwarded-for con espacios extra", () => {
    const req = createMockRequest({ ip: "  10.0.0.5  , 192.168.1.1" });
    expect(getClientIp(req)).toBe("10.0.0.5");
  });

  it("x-forwarded-for con IPv6", () => {
    const req = createMockRequest({ ip: "::1, 192.168.1.1" });
    expect(getClientIp(req)).toBe("::1");
  });
});
