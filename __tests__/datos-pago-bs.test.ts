import { describe, it, expect } from "vitest";
import { datosPagoBs } from "@/lib/features/pagos/domain/banco";
import type { BsBankInfo } from "@/lib/types";

const base: BsBankInfo = {
  banco: "Banesco",
  cedula: "V-12345678",
  telefono: "04141234567",
  tipo_cuenta: "ahorro",
  numero_transferencia: "01340123456789012345",
  titular: "Ana Pérez",
};

const soloBanco: BsBankInfo = {
  banco: "Banesco",
  cedula: "",
  telefono: "",
  tipo_cuenta: "",
  numero_transferencia: "",
  titular: "",
};

function valores(filas: { campo: string; valor: string }[]): Record<string, string> {
  return Object.fromEntries(filas.map((f) => [f.campo, f.valor]));
}

describe("datosPagoBs", () => {
  it("devuelve vacío para info nula o indefinida", () => {
    expect(datosPagoBs(null)).toEqual({ pagoMovil: [], transferencia: [] });
    expect(datosPagoBs(undefined)).toEqual({ pagoMovil: [], transferencia: [] });
  });

  it("expone pago móvil completo con banco, cédula y teléfono", () => {
    const r = datosPagoBs(base);
    expect(valores(r.pagoMovil)).toEqual({
      banco: "Banesco",
      cedula: "V-12345678",
      telefono: "04141234567",
    });
  });

  it("oculta pago móvil si falta cédula o teléfono", () => {
    expect(datosPagoBs({ ...base, cedula: "" }).pagoMovil).toEqual([]);
    expect(datosPagoBs({ ...base, telefono: "  " }).pagoMovil).toEqual([]);
  });

  it("expone transferencia completa con tipo de cuenta", () => {
    const r = datosPagoBs(base);
    expect(valores(r.transferencia)).toEqual({
      banco: "Banesco",
      tipo_cuenta: "ahorro",
      numero_transferencia: "01340123456789012345",
      titular: "Ana Pérez",
    });
  });

  it("exige número de cuenta de exactamente 20 dígitos", () => {
    expect(datosPagoBs({ ...base, numero_transferencia: "0134012345678901234" }).transferencia).toEqual([]);
    expect(datosPagoBs({ ...base, numero_transferencia: "0134012345678901234a" }).transferencia).toEqual([]);
  });

  it("exige tipo de cuenta válido y titular", () => {
    expect(datosPagoBs({ ...base, tipo_cuenta: "" }).transferencia).toEqual([]);
    expect(datosPagoBs({ ...base, titular: "" }).transferencia).toEqual([]);
  });

  it("sin banco no muestra ninguna sección", () => {
    expect(datosPagoBs({ ...soloBanco, banco: " " })).toEqual({ pagoMovil: [], transferencia: [] });
  });

  it("con transferencia completa pero sin pago móvil muestra solo transferencia", () => {
    const r = datosPagoBs({ ...base, cedula: "", telefono: "" });
    expect(r.pagoMovil).toEqual([]);
    expect(r.transferencia).toHaveLength(4);
  });

  it("con solo banco no muestra secciones", () => {
    expect(datosPagoBs(soloBanco)).toEqual({ pagoMovil: [], transferencia: [] });
  });
});
