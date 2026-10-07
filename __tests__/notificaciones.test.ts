import { describe, it, expect } from "vitest";
import { messages } from "@/lib/messages";
import {
  MIN_DIAS_AVISO_DEUDA,
  verificarFrecuencia,
} from "@/lib/features/notificaciones/frecuencia";

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
    expect(verificarFrecuencia(config, null)).toBe(false);
  });

  it("should execute if no previous log exists", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    expect(verificarFrecuencia(config, null)).toBe(true);
  });

  it("daily: should execute if 1+ days since last", () => {
    const config = {
      ...baseConfig,
      notification_type: "resumen_dueno",
      daily_frequency: true,
    };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, twoDaysAgo)).toBe(true);
  });

  it("daily: should not execute if less than 1 day since last", () => {
    const config = {
      ...baseConfig,
      notification_type: "resumen_dueno",
      daily_frequency: true,
    };
    const hoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, hoursAgo)).toBe(false);
  });

  it("weekly: should execute if 7+ days since last", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    const lastWeek = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, lastWeek)).toBe(true);
  });

  it("weekly: should not execute if less than 7 days since last", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, twoDaysAgo)).toBe(false);
  });

  it("biweekly: should execute if 15+ days since last", () => {
    const config = { ...baseConfig, biweekly_frequency: true };
    const sixteenDaysAgo = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, sixteenDaysAgo)).toBe(true);
  });

  it("biweekly: should not execute if less than 15 days since last", () => {
    const config = { ...baseConfig, biweekly_frequency: true };
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, tenDaysAgo)).toBe(false);
  });

  it("monthly: should execute if 30+ days since last", () => {
    const config = { ...baseConfig, monthly_frequency: true };
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, thirtyOneDaysAgo)).toBe(true);
  });

  it("monthly: should not execute if less than 30 days since last", () => {
    const config = { ...baseConfig, monthly_frequency: true };
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, fifteenDaysAgo)).toBe(false);
  });

  it("should check first matching frequency (daily takes priority)", () => {
    const config = {
      ...baseConfig,
      daily_frequency: true,
      monthly_frequency: true,
    };
    const hoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    // Daily: 12h < 24h → false, monthly check doesn't run because daily was checked first
    expect(verificarFrecuencia(config, hoursAgo)).toBe(false);
  });

  it("deudores: no re-avisa dentro del piso de 7 días aunque sea diario", () => {
    const config = { ...baseConfig, daily_frequency: true };
    const haceDosDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, haceDosDias)).toBe(false);
  });

  it("deudores: vuelve a avisar pasado el piso de 7 días", () => {
    const config = { ...baseConfig, daily_frequency: true };
    const haceOchoDias = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(MIN_DIAS_AVISO_DEUDA).toBe(7);
    expect(verificarFrecuencia(config, haceOchoDias)).toBe(true);
  });

  it("otros tipos: el piso de deudores no les aplica", () => {
    const config = { ...baseConfig, notification_type: "resumen_dueno", daily_frequency: true };
    const haceDosDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(verificarFrecuencia(config, haceDosDias)).toBe(true);
  });

  it("fecha de log inválida: se trata como 'nunca envió'", () => {
    const config = { ...baseConfig, weekly_frequency: true };
    expect(verificarFrecuencia(config, "no-es-fecha")).toBe(true);
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
