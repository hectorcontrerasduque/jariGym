/**
 * Unit tests for the pure pagos domain (lib/features/pagos/domain).
 * No Supabase, no fake timers: "hoy" is always an explicit argument.
 * Scenarios mirror openspec/changes/pagos-service-testable/specs/pagos/spec.md.
 */
import { describe, it, expect } from "vitest";
import { filtrarElegibles } from "@/lib/features/pagos/domain/elegibles";
import { calcularMesesPendientes } from "@/lib/features/pagos/domain/meses-pendientes";
import type { MiembroElegible } from "@/lib/features/pagos/domain/types";

const HOY = new Date(2026, 8, 12, 12);

function perfil(overrides: Partial<MiembroElegible> = {}): MiembroElegible {
  return {
    id: "m1",
    email: "m1@test.com",
    full_name: "Miembro Uno",
    inscription_paid: true,
    activo: true,
    start_date: "2026-01-01",
    avatar_url: null,
    role: "miembro",
    inscription_admin_note: null,
    arrival_time: null,
    departure_time: null,
    ...overrides,
  };
}

describe("filtrarElegibles", () => {
  const base = { perfiles: [], metodoPago: null, membresias: [], gymConfig: null };

  it("activo nulo es elegible; false, 0 y 'false' no", () => {
    const perfiles = [
      perfil({ id: "null", activo: null }),
      perfil({ id: "false", activo: false }),
      perfil({ id: "zero", activo: 0 as unknown as boolean }),
      perfil({ id: "str", activo: "false" as unknown as boolean }),
    ];
    expect(filtrarElegibles({ ...base, perfiles }, HOY).miembros.map((m) => m.id)).toEqual(["null"]);
  });

  it("membresía libre con inicio futuro no cuenta; la fecha se guarda igual", () => {
    const r = filtrarElegibles(
      { ...base, membresias: [{ user_id: "a", start_date: null }, { user_id: "b", start_date: "2026-12-01" }] },
      HOY
    );
    expect([...r.miembrosLibresIds]).toEqual(["a"]);
    expect(r.fechaInicioMap.get("b")).toBe("2026-12-01");
  });

  it("la fecha de referencia es el parámetro hoy", () => {
    const membresias = [{ user_id: "a", start_date: "2026-10-01" }];
    expect(filtrarElegibles({ ...base, membresias }, HOY).miembrosLibresIds.has("a")).toBe(false);
    expect(filtrarElegibles({ ...base, membresias }, new Date(2026, 9, 2)).miembrosLibresIds.has("a")).toBe(true);
  });

  it("sin método de pago ni config: montos 0, dia_uno, owner vacío; datos nulos → listas vacías", () => {
    const r = filtrarElegibles({ perfiles: null, metodoPago: null, membresias: null, gymConfig: null }, HOY);
    expect(r).toMatchObject({ miembros: [], montoMensual: 0, montoInscripcion: 0, modoCobro: "dia_uno", ownerEmail: "" });
  });

  it("owner en minúsculas y modo configurado", () => {
    const r = filtrarElegibles({ ...base, gymConfig: { owner_email: "Dueno@Gym.COM", billing_mode: "fecha_inscripcion" } }, HOY);
    expect(r.ownerEmail).toBe("dueno@gym.com");
    expect(r.modoCobro).toBe("fecha_inscripcion");
  });
});

describe("calcularMesesPendientes", () => {
  const meses = (...m: number[]) => m.map((month_number) => ({ month_number, year_number: 2026 }));

  it("incluye meses futuros desde el mes de inicio", () => {
    expect(calcularMesesPendientes([], 2026, "2026-10-01")).toEqual(meses(10, 11, 12));
  });

  it("un detalle del año bloquea el mes; otros años y meses nulos se ignoran", () => {
    const detalles = [
      { month_number: 11, year_number: 2026 },
      { month_number: 12, year_number: 2025 },
      { month_number: null, year_number: 2026 },
    ];
    expect(calcularMesesPendientes(detalles, 2026, "2026-10-01")).toEqual(meses(10, 12));
  });

  it("inicio en año anterior o sin fecha: desde enero", () => {
    expect(calcularMesesPendientes([], 2026, "2025-06-01")).toHaveLength(12);
    expect(calcularMesesPendientes([], 2026)).toHaveLength(12);
  });

  it("inicio en año posterior → []", () => {
    expect(calcularMesesPendientes([], 2026, "2027-01-01")).toEqual([]);
  });
});
