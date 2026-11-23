import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { cargarIconoGym, FALLBACK_ICON_SVG } from "@/lib/features/config/icono";

let fake: SupabaseFake;

beforeEach(() => {
  fake = createSupabaseFake();
});

function pngResponse(bytes: number[] = [1, 2, 3], type = "image/png") {
  return new Response(new Uint8Array(bytes), { headers: { "content-type": type } });
}

describe("cargarIconoGym", () => {
  it("devuelve el logo del gimnasio cuando existe", async () => {
    fake.on("gym_config", "select").reply({ data: { logo_url: "https://cdn.test/logo.png" } });
    const fetchMock = vi.fn(async () => pngResponse());

    const r = await cargarIconoGym(fake.client, fetchMock as unknown as typeof fetch);

    expect(r.esFallback).toBe(false);
    expect(r.contentType).toBe("image/png");
    expect((r.bytes as ArrayBuffer).byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.test/logo.png", { cache: "no-store" });
  });

  it("sin logo usa el favicon estático", async () => {
    fake.on("gym_config", "select").reply({ data: { logo_url: null } });
    const fetchMock = vi.fn();

    const r = await cargarIconoGym(fake.client, fetchMock as unknown as typeof fetch);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.esFallback).toBe(true);
    expect(r.contentType).toBe("image/svg+xml");
    expect(r.bytes).toBe(FALLBACK_ICON_SVG);
  });

  it("si la descarga falla usa el fallback", async () => {
    fake.on("gym_config", "select").reply({ data: { logo_url: "https://cdn.test/logo.png" } });
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));

    const r = await cargarIconoGym(fake.client, fetchMock as unknown as typeof fetch);

    expect(r.esFallback).toBe(true);
    expect(r.bytes).toBe(FALLBACK_ICON_SVG);
  });

  it("si el content-type no es imagen usa el fallback", async () => {
    fake.on("gym_config", "select").reply({ data: { logo_url: "https://cdn.test/logo" } });
    const fetchMock = vi.fn(async () => pngResponse([1], "text/html"));

    const r = await cargarIconoGym(fake.client, fetchMock as unknown as typeof fetch);

    expect(r.esFallback).toBe(true);
  });
});
