import { describe, it, expect } from "vitest";
import { validarBsBankInfo } from "@/lib/services/config/bank-info";
import type { BsBankInfo } from "@/lib/types";

const base: BsBankInfo = {
  banco: "Banesco",
  cedula: "",
  telefono: "",
  tipo_cuenta: "",
  numero_transferencia: "",
  titular: "",
};

const transferenciaCompleta: BsBankInfo = {
  ...base,
  tipo_cuenta: "ahorro",
  numero_transferencia: "01340123456789012345",
  titular: "Ana Pérez",
};

describe("validarBsBankInfo", () => {
  it("pago móvil completo (cédula + teléfono) solo exige banco", () => {
    const r = validarBsBankInfo({ ...base, cedula: "V-12345678", telefono: "04141234567" });
    expect(r).toEqual({ ok: true, faltan: [], numeroInvalido: false });
  });

  it("pago móvil completo con transferencia a medias exige el set completo", () => {
    const r = validarBsBankInfo({
      ...base,
      cedula: "V-12345678",
      telefono: "04141234567",
      titular: "Ana Pérez",
    });
    expect(r.ok).toBe(false);
    expect(r.faltan).toEqual(["tipo_cuenta", "numero_transferencia"]);
  });

  it("transferencia completa sin pago móvil es válida", () => {
    const r = validarBsBankInfo(transferenciaCompleta);
    expect(r).toEqual({ ok: true, faltan: [], numeroInvalido: false });
  });

  it("cédula sin teléfono no cuenta como pago móvil: exige transferencia", () => {
    const r = validarBsBankInfo({ ...base, cedula: "V-12345678" });
    expect(r.ok).toBe(false);
    expect(r.faltan).toEqual(["tipo_cuenta", "numero_transferencia", "titular"]);
  });

  it("número de transferencia con menos de 20 dígitos es inválido", () => {
    const r = validarBsBankInfo({ ...transferenciaCompleta, numero_transferencia: "0134012345678901234" });
    expect(r.numeroInvalido).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("número de transferencia con más de 20 dígitos es inválido", () => {
    const r = validarBsBankInfo({ ...transferenciaCompleta, numero_transferencia: "013401234567890123456" });
    expect(r.numeroInvalido).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("número con caracteres no numéricos es inválido", () => {
    const r = validarBsBankInfo({ ...transferenciaCompleta, numero_transferencia: "0134012345678901234a" });
    expect(r.numeroInvalido).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("acepta números de 20 dígitos que empiezan por 00 (se conservan como string)", () => {
    const r = validarBsBankInfo({ ...transferenciaCompleta, numero_transferencia: "00123456789012345678" });
    expect(r).toEqual({ ok: true, faltan: [], numeroInvalido: false });
  });

  it("banco es obligatorio en ambos canales", () => {
    const pm = validarBsBankInfo({ ...base, banco: "", cedula: "V-1", telefono: "0414" });
    expect(pm.faltan).toContain("banco");
    const tr = validarBsBankInfo({ ...transferenciaCompleta, banco: "  " });
    expect(tr.faltan).toContain("banco");
    expect(tr.ok).toBe(false);
  });

  it("datos vacíos o nulos exigen banco + transferencia", () => {
    expect(validarBsBankInfo(null).faltan).toEqual([
      "banco",
      "tipo_cuenta",
      "numero_transferencia",
      "titular",
    ]);
    expect(validarBsBankInfo(undefined).ok).toBe(false);
  });
});
