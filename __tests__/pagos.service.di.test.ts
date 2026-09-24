import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseFake } from "./helpers/supabase-fake";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));

import { PagosService } from "@/lib/features/pagos/service";

describe("PagosService — client injection", () => {
  beforeEach(() => {
    h.createClient.mockReset();
  });

  it("uses the constructor client for writes and reads and never creates a browser client", async () => {
    const fake = createSupabaseFake();
    fake.setUser({ id: "admin-1" });
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payment_detail", "select").reply({ data: [] });
    const service = new PagosService(fake.client);

    await service.rechazarPago("p1");
    await service.mesesPendientes("u1", 2026);

    expect(fake.callsTo("payments", "update")).toHaveLength(1);
    expect(fake.callsTo("payment_detail", "select")).toHaveLength(1);
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("without a client, creates the browser client lazily on first use and reuses it", async () => {
    const fake = createSupabaseFake();
    h.createClient.mockReturnValue(fake.client);

    const service = new PagosService();
    expect(h.createClient).not.toHaveBeenCalled();

    await service.mesesPendientes("u1", 2026);
    await service.getMiembrosLibres();
    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(fake.calls).toHaveLength(2);
  });

  it("the per-call supabaseClient argument wins over the constructor client on reads", async () => {
    const ctor = createSupabaseFake();
    const perCall = createSupabaseFake();
    const service = new PagosService(ctor.client);

    await service.getMiembrosLibres(perCall.client);

    expect(perCall.callsTo("memberships")).toHaveLength(1);
    expect(ctor.calls).toHaveLength(0);
  });
});
