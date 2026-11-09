import { describe, it, expect } from "vitest";
import { metodoPrincipal } from "@/lib/utils";

const efectivo = { payment_method: "efectivo" as const, amount_monthly: 5 };
const bs = { payment_method: "bs" as const, amount_monthly: 7 };
const binance = { payment_method: "binance" as const, amount_monthly: 6 };

describe("metodoPrincipal", () => {
  it("prefiere efectivo sobre bs y binance", () => {
    expect(metodoPrincipal([binance, bs, efectivo])).toBe(efectivo);
    expect(metodoPrincipal([bs, binance])).toBe(bs);
  });

  it("prefiere bs sobre binance", () => {
    expect(metodoPrincipal([binance, bs])).toBe(bs);
  });

  it("devuelve el unico elemento de la lista", () => {
    expect(metodoPrincipal([bs])).toBe(bs);
  });

  it("lista vacia -> null", () => {
    expect(metodoPrincipal([])).toBeNull();
  });

  it("metodo desconocido queda en ultima prioridad pero se devuelve", () => {
    const otro = { payment_method: "otro" as never, amount_monthly: 1 };
    expect(metodoPrincipal([otro, bs])).toBe(bs);
    expect(metodoPrincipal([otro])).toBe(otro);
  });

  it("con varios activos devuelve siempre el mismo (determinista)", () => {
    const lista = [bs, efectivo, binance];
    expect(metodoPrincipal(lista)).toBe(efectivo);
    expect(metodoPrincipal([...lista].reverse())).toBe(efectivo);
  });
});
