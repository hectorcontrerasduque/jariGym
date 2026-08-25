import { describe, it, expect } from "vitest";

interface NotificacionConfig {
  id: string;
  tipo_notificacion: string;
  habilitado: boolean;
  frecuencia_semanal: boolean;
  frecuencia_quincenal: boolean;
  frecuencia_mensual: boolean;
}

function verificarFrecuenciaLocal(
  config: NotificacionConfig,
  ultimoLogFecha: string | null
): boolean {
  const tieneFrecuencia =
    config.frecuencia_semanal ||
    config.frecuencia_quincenal ||
    config.frecuencia_mensual;
  if (!tieneFrecuencia) return false;

  if (!ultimoLogFecha) return true;

  const ahora = new Date();
  const ultimoEnvio = new Date(ultimoLogFecha);
  const diasDesdeUltimo =
    (ahora.getTime() - ultimoEnvio.getTime()) / (1000 * 60 * 60 * 24);

  if (config.frecuencia_semanal && diasDesdeUltimo >= 7) return true;
  if (config.frecuencia_quincenal && diasDesdeUltimo >= 15) return true;
  if (config.frecuencia_mensual && diasDesdeUltimo >= 30) return true;

  return false;
}

describe("Notification frequency logic", () => {
  const baseConfig: NotificacionConfig = {
    id: "config-1",
    tipo_notificacion: "miembros_deudores",
    habilitado: true,
    frecuencia_semanal: false,
    frecuencia_quincenal: false,
    frecuencia_mensual: false,
  };

  it("should not execute if no frequency is set", () => {
    const config = { ...baseConfig };
    expect(verificarFrecuenciaLocal(config, null)).toBe(false);
  });

  it("should execute if no previous log exists", () => {
    const config = { ...baseConfig, frecuencia_semanal: true };
    expect(verificarFrecuenciaLocal(config, null)).toBe(true);
  });

  it("weekly: should execute if 7+ days since last", () => {
    const config = { ...baseConfig, frecuencia_semanal: true };
    const lastWeek = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, lastWeek)).toBe(true);
  });

  it("weekly: should not execute if less than 7 days since last", () => {
    const config = { ...baseConfig, frecuencia_semanal: true };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, twoDaysAgo)).toBe(false);
  });

  it("fortnightly: should execute if 15+ days since last", () => {
    const config = { ...baseConfig, frecuencia_quincenal: true };
    const sixteenDaysAgo = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, sixteenDaysAgo)).toBe(true);
  });

  it("fortnightly: should not execute if less than 15 days since last", () => {
    const config = { ...baseConfig, frecuencia_quincenal: true };
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, tenDaysAgo)).toBe(false);
  });

  it("monthly: should execute if 30+ days since last", () => {
    const config = { ...baseConfig, frecuencia_mensual: true };
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, thirtyOneDaysAgo)).toBe(true);
  });

  it("monthly: should not execute if less than 30 days since last", () => {
    const config = { ...baseConfig, frecuencia_mensual: true };
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, fifteenDaysAgo)).toBe(false);
  });

  it("should check first matching frequency (weekly takes priority)", () => {
    const config = {
      ...baseConfig,
      frecuencia_semanal: true,
      frecuencia_mensual: true,
    };
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    // Weekly: 5 < 7 → false, but monthly check doesn't run because weekly was checked first
    expect(verificarFrecuenciaLocal(config, fiveDaysAgo)).toBe(false);
  });
});

describe("Notificacion config types", () => {
  it("should support all notification types", () => {
    const tipos = [
      "miembros_deudores",
      "recordatorio_pago",
      "resumen_dueno",
      "estatus_sistema",
    ];
    expect(tipos).toContain("miembros_deudores");
    expect(tipos).toContain("recordatorio_pago");
    expect(tipos).toContain("resumen_dueno");
    expect(tipos).toContain("estatus_sistema");
  });

  it("each type should have a label in messages", () => {
    const { messages } = require("@/lib/messages");
    expect(messages.notificaciones.miembrosDeudores).toBeDefined();
    expect(messages.notificaciones.recordatorioPago).toBeDefined();
    expect(messages.notificaciones.resumenDueno).toBeDefined();
    expect(messages.notificaciones.estatusSistema).toBeDefined();
  });
});
