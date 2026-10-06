import { describe, it, expect } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import {
  calcularEstatusSistema,
  calcularResumenDueno,
  etiquetaFrecuencia,
} from "@/lib/features/notificaciones/datos";

const HOY = new Date();
const ANIO = HOY.getFullYear();
const MES = HOY.getMonth() + 1;
const MES_PAGADO = `${ANIO}-${String(MES).padStart(2, "0")}-01`;
const MES_DEUDA = `${ANIO}-01-01`;

function miembro(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    email: "m1@test.com",
    full_name: "Miembro Uno",
    inscription_paid: true,
    activo: true,
    start_date: MES_PAGADO,
    avatar_url: null,
    role: "miembro",
    inscription_admin_note: null,
    arrival_time: null,
    departure_time: null,
    ...overrides,
  };
}

function filaPagoMes(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `p-${userId}`,
    user_id: userId,
    status: "aprobado",
    payment_note: null,
    payment_method: "efectivo",
    bill_code: null,
    receipt_url: null,
    created_at: HOY.toISOString(),
    month_number: MES,
    year_number: ANIO,
    payment_amount: 30,
    payment_type: "mensualidad",
    ...overrides,
  };
}

function encolarElegibles(fake: SupabaseFake, perfiles: unknown[]) {
  fake.on("profiles", "select").reply({ data: perfiles });
  fake.on("gym_config_payment_methods", "select").reply({
    data: { amount_monthly: 30, amount_inscription: 10 },
  });
  fake.on("memberships", "select").reply({ data: [] });
  fake.on("gym_config", "select").reply({
    data: { owner_email: "owner@gym.com", billing_mode: "dia_uno" },
  });
}

describe("etiquetaFrecuencia", () => {
  it("maps each frequency flag to its label", () => {
    expect(etiquetaFrecuencia({ daily_frequency: true })).toBe("Diario");
    expect(etiquetaFrecuencia({ weekly_frequency: true })).toBe("Semanal");
    expect(etiquetaFrecuencia({ biweekly_frequency: true })).toBe("Quincenal");
    expect(etiquetaFrecuencia({})).toBe("Mensual");
  });

  it("gives daily priority over the rest", () => {
    expect(
      etiquetaFrecuencia({ daily_frequency: true, weekly_frequency: true, monthly_frequency: true })
    ).toBe("Diario");
  });
});

describe("calcularResumenDueno", () => {
  it("sums pending payment amounts (not total debt) for the pending card", async () => {
    const fake = createSupabaseFake();
    const enDeuda = miembro({ id: "m2", email: "m2@test.com", start_date: MES_DEUDA });

    encolarElegibles(fake, [miembro(), enDeuda]);
    fake.onRpc("get_pagos_por_anio").reply({ data: [filaPagoMes("m1")] });
    fake.on("payment_detail", "select").reply({
      data: [
        { payment_id: "p-ok", payment_amount: 30 },
        { payment_id: "p-1", payment_amount: 30 },
        { payment_id: "p-2", payment_amount: 45 },
      ],
    });
    fake.on("payments", "select").reply({
      data: [
        { id: "p-ok", status: "aprobado" },
        { id: "p-1", status: "pendiente" },
        { id: "p-2", status: "pendiente" },
      ],
    });
    fake.on("migracion", "select").reply({
      data: [
        { nombre: "Ana Pérez", migrado: "si" },
        { nombre: "ANA PÉREZ", migrado: "si" },
        { nombre: "ana pérez", migrado: "no" },
        { nombre: "Luis Gómez", migrado: "migrado" },
        { nombre: "luis góMEZ", migrado: "no" },
        { nombre: "Juan Rojas", migrado: "no" },
      ],
    });

    const resumen = await calcularResumenDueno(fake.client);

    expect(resumen.pagosAprobados).toBe(1);
    expect(resumen.pagosPendientes).toBe(2);
    expect(resumen.montoCobrado).toBe(30);
    expect(resumen.montoPendiente).toBe(75);
    expect(resumen.migraciones).toBe(2);
    expect(resumen.migracionesTotal).toBe(3);

    expect(resumen.miembrosDeudores).toBe(1);
    expect(resumen.miembrosAlDia).toBe(1);
    expect(resumen.montoDeuda).toBe(MES * 30);
    expect(resumen.montoPendiente).not.toBe(resumen.montoDeuda);
  });

  it("reports everyone up to date when there is no debt", async () => {
    const fake = createSupabaseFake();
    encolarElegibles(fake, [miembro()]);
    fake.onRpc("get_pagos_por_anio").reply({ data: [filaPagoMes("m1")] });
    fake.on("payment_detail", "select").reply({ data: [] });
    fake.on("migracion", "select").reply({ data: [] });

    const resumen = await calcularResumenDueno(fake.client);

    expect(resumen).toMatchObject({
      pagosAprobados: 0,
      pagosPendientes: 0,
      montoCobrado: 0,
      montoPendiente: 0,
      montoDeuda: 0,
      miembrosDeudores: 0,
      miembrosAlDia: 1,
      migraciones: 0,
      migracionesTotal: 0,
    });
  });

  it("queries payment_detail by month instead of scanning every payment", async () => {
    const fake = createSupabaseFake();
    encolarElegibles(fake, [miembro()]);
    fake.onRpc("get_pagos_por_anio").reply({ data: [filaPagoMes("m1")] });
    fake.on("payment_detail", "select").reply({ data: [] });
    fake.on("migracion", "select").reply({ data: [] });

    await calcularResumenDueno(fake.client);

    const pagos = fake.callsTo("payments", "select");
    expect(pagos).toHaveLength(0);

    const detalle = fake.callsTo("payment_detail", "select")[0];
    expect(detalle.filters).toEqual(
      expect.arrayContaining([
        ["eq", "month_number", MES],
        ["eq", "year_number", ANIO],
      ])
    );
  });
});

describe("calcularEstatusSistema", () => {
  it("computes month amounts from payment_detail instead of hardcoded zeros", async () => {
    const fake = createSupabaseFake();
    fake.on("profiles", "select").reply({ count: 4 });
    fake.on("profiles", "select").reply({ count: 1 });
    fake.on("payment_detail", "select").reply({
      data: [
        { payment_id: "p-ok", payment_amount: 30 },
        { payment_id: "p-1", payment_amount: 30 },
        { payment_id: "p-2", payment_amount: 45 },
      ],
    });
    fake.on("payments", "select").reply({
      data: [
        { id: "p-ok", status: "aprobado" },
        { id: "p-1", status: "pendiente" },
        { id: "p-2", status: "pendiente" },
      ],
    });
    fake.on("profiles", "select").reply({
      data: { full_name: "Ana Pérez", created_at: HOY.toISOString() },
    });
    fake.on("payments", "select").reply({ data: { created_at: "2026-10-01T10:00:00.000Z" } });
    fake.on("notification_log", "select").reply({
      data: [
        {
          error_detail: "timeout al enviar",
          sent_at: "2026-10-01T10:00:00.000Z",
          notification_config: { notification_type: "miembros_deudores" },
        },
      ],
    });
    fake.on("migracion", "select").reply({
      data: [
        { nombre: "Pedro Díaz", migrado: "si" },
        { nombre: "PEDRO DÍAZ", migrado: "si" },
        { nombre: "Marta Solís", migrado: "si" },
        { nombre: "Carla Núñez", migrado: "migrado" },
        { nombre: "Diego Prado", migrado: "no" },
      ],
    });

    const { metricas, errores } = await calcularEstatusSistema(fake.client, {
      max_members: 80,
    });

    expect(metricas).toMatchObject({
      totalMiembrosActivos: 4,
      totalMiembrosInactivos: 1,
      pagosAprobadosMes: 1,
      pagosPendientesMes: 2,
      montoRecaudadoMes: 30,
      montoPendienteMes: 75,
      capacidad: 4,
      maxMiembros: 80,
      migraciones: 3,
      migracionesTotal: 4,
    });

    expect(metricas.ultimoMiembroRegistrado).toBe("Ana Pérez");
    expect(metricas.ultimoPagoRegistrado).not.toContain("T");
    expect(metricas.ultimoPagoRegistrado).not.toContain("Nunca");

    expect(errores).toEqual([
      {
        tipo: "miembros_deudores",
        fecha: new Date("2026-10-01T10:00:00.000Z").toLocaleDateString("es-ES"),
        detalle: "timeout al enviar",
      },
    ]);
  });

  it("counts only role miembro profiles for capacity", async () => {
    const fake = createSupabaseFake();
    fake.on("profiles", "select").reply({ count: 7 });
    fake.on("profiles", "select").reply({ count: 0 });
    fake.on("payment_detail", "select").reply({ data: [] });
    fake.on("profiles", "select").reply({ data: null });
    fake.on("payments", "select").reply({ data: null });
    fake.on("notification_log", "select").reply({ data: [] });
    fake.on("migracion", "select").reply({ data: [] });

    const { metricas } = await calcularEstatusSistema(fake.client, { max_members: 50 });

    expect(metricas.capacidad).toBe(7);
    expect(metricas.ultimoMiembroRegistrado).toBe("N/A");
    expect(metricas.ultimoPagoRegistrado).toBe("N/A");

    const activos = fake.callsTo("profiles", "select")[0];
    expect(activos.filters).toEqual(
      expect.arrayContaining([
        ["eq", "role", "miembro"],
        ["eq", "activo", true],
      ])
    );
  });
});
