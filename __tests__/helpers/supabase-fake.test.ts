import { describe, it, expect } from "vitest";
import { createSupabaseFake } from "./supabase-fake";

describe("createSupabaseFake", () => {
  it("returns { data: null, error: null } when nothing is queued", async () => {
    const fake = createSupabaseFake();
    const res = await fake.client.from("payments").select("*").eq("id", "1");
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
  });

  it("serves replies FIFO per table and op", async () => {
    const fake = createSupabaseFake();
    fake.on("payments", "select").reply({ data: [1] }).reply({ data: [2] });
    fake.on("payments", "insert").reply({ data: { id: "p1" } });

    expect((await fake.client.from("payments").select("*")).data).toEqual([1]);
    expect((await fake.client.from("payments").insert({}).select().single()).data).toEqual({ id: "p1" });
    expect((await fake.client.from("payments").select("*")).data).toEqual([2]);
  });

  it("classifies the builder by its first operation and records payload and filters", async () => {
    const fake = createSupabaseFake();
    await fake.client.from("payments").update({ status: "rechazado" }).eq("id", "p1").eq("status", "pendiente").select().single();

    const [call] = fake.callsTo("payments", "update");
    expect(call.payload).toEqual({ status: "rechazado" });
    expect(call.filters).toContainEqual(["eq", "status", "pendiente"]);
    expect(call.filters).toContainEqual(["single"]);
  });

  it("programs rpc replies and auth user", async () => {
    const fake = createSupabaseFake();
    fake.onRpc("get_pagos_por_anio").reply({ data: [{ id: "x" }] });
    fake.setUser({ id: "u1" });

    expect((await fake.client.rpc("get_pagos_por_anio", { p_anio: 2026 })).data).toEqual([{ id: "x" }]);
    expect(fake.calls[0]).toMatchObject({ kind: "rpc", table: "get_pagos_por_anio", payload: { p_anio: 2026 } });
    expect((await fake.client.auth.getUser()).data.user).toEqual({ id: "u1" });
  });

  it("resolves a builder only once even if awaited twice", async () => {
    const fake = createSupabaseFake();
    fake.on("profiles", "select").reply({ data: "a" }).reply({ data: "b" });
    const q = fake.client.from("profiles").select("*");
    expect((await q).data).toBe("a");
    expect((await q).data).toBe("a");
  });
});
