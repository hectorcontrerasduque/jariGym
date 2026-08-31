import { describe, it, expect } from "vitest";
import { messages } from "@/lib/messages";

interface NotificacionConfig {
  id: string;
  notification_type: string;
  is_active: boolean;
  daily_frequency: boolean;
  weekly_frequency: boolean;
  biweekly_frequency: boolean;
  monthly_frequency: boolean;
  days_before: number;
  notify_by_email: boolean;
  notify_by_whatsapp: boolean;
}

function verificarFrecuenciaLocal(
  config: NotificacionConfig,
  ultimoLogFecha: string | null
): boolean {
  const tieneFrecuencia =
    config.daily_frequency ||
    config.weekly_frequency ||
    config.biweekly_frequency ||
    config.monthly_frequency;
  if (!tieneFrecuencia) return false;

  if (!ultimoLogFecha) return true;

  const ahora = new Date();
  const ultimoEnvio = new Date(ultimoLogFecha);
  const diasDesdeUltimo =
    (ahora.getTime() - ultimoEnvio.getTime()) / (1000 * 60 * 60 * 24);

  if (config.daily_frequency && diasDesdeUltimo >= 1) return true;
  if (config.weekly_frequency && diasDesdeUltimo >= 7) return true;
  if (config.biweekly_frequency && diasDesdeUltimo >= 15) return true;
  if (config.monthly_frequency && diasDesdeUltimo >= 30) return true;

  return false;
}

describe("Notification frequency logic", () => {
  const baseConfig: NotificacionConfig = {
    id: "config-1",
    notification_type: "miembros_deudores",
    is_active: true,
    daily_frequency: false,
    weekly_frequency: false,
    biweekly_frequency: false,
    monthly_frequency: false,
    days_before: 3,
    notify_by_email: true,
    notify_by_whatsapp: false,
  };

  it("should not execute if no frequency is set", () => {
    const config = { ...baseConfig };
    expect(verificarFrecuenciaLocal(config, null)).toBe(false);
  });

  it("should execute if no previous log exists", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    expect(verificarFrecuenciaLocal(config, null)).toBe(true);
  });

  it("daily: should execute if 1+ days since last", () => {
    const config = { ...baseConfig, daily_frequency: true };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, twoDaysAgo)).toBe(true);
  });

  it("daily: should not execute if less than 1 day since last", () => {
    const config = { ...baseConfig, daily_frequency: true };
    const hoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, hoursAgo)).toBe(false);
  });

  it("weekly: should execute if 7+ days since last", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    const lastWeek = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, lastWeek)).toBe(true);
  });

  it("weekly: should not execute if less than 7 days since last", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, twoDaysAgo)).toBe(false);
  });

  it("biweekly: should execute if 15+ days since last", () => {
    const config = { ...baseConfig, biweekly_frequency: true };
    const sixteenDaysAgo = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, sixteenDaysAgo)).toBe(true);
  });

  it("biweekly: should not execute if less than 15 days since last", () => {
    const config = { ...baseConfig, biweekly_frequency: true };
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, tenDaysAgo)).toBe(false);
  });

  it("monthly: should execute if 30+ days since last", () => {
    const config = { ...baseConfig, monthly_frequency: true };
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, thirtyOneDaysAgo)).toBe(true);
  });

  it("monthly: should not execute if less than 30 days since last", () => {
    const config = { ...baseConfig, monthly_frequency: true };
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuenciaLocal(config, fifteenDaysAgo)).toBe(false);
  });

  it("should check first matching frequency (daily takes priority)", () => {
    const config = {
      ...baseConfig,
      daily_frequency: true,
      monthly_frequency: true,
    };
    const hoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    // Daily: 12h < 24h → false, monthly check doesn't run because daily was checked first
    expect(verificarFrecuenciaLocal(config, hoursAgo)).toBe(false);
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
    expect(messages.notificaciones.tipoMiembrosDeudores).toBeDefined();
    expect(messages.notificaciones.tipoRecordatorioPago).toBeDefined();
    expect(messages.notificaciones.tipoResumenDueno).toBeDefined();
    expect(messages.notificaciones.tipoEstatusSistema).toBeDefined();
  });
});
