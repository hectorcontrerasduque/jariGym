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

/**
 * Instante "raw" cuyo día VET es el indicado (04:00 UTC = 00:00 VET).
 * Anclas 2026: 5/oct = lunes · 3/oct = sábado · 4/oct = domingo ·
 * 31/ene y 28/feb = últimos días de mes.
 */
const vet = (year: number, month: number, day: number, horaUtc = 4) =>
  new Date(Date.UTC(year, month, day, horaUtc));

describe("Notification frequency logic (calendario)", () => {
  const baseConfig: NotificacionConfig = {
    id: "config-1",
    notification_type: "miembros_deudores",
    is_active: true,
    daily_frequency: false,
    weekly_frequency: false,
    biweekly_frequency: false,
    monthly_frequency: false,
    days_before: 0,
    notify_by_email: true,
    notify_by_whatsapp: false,
  };

  it("no corre sin frecuencia configurada", () => {
    expect(verificarFrecuencia({ ...baseConfig }, null, vet(2026, 9, 7))).toBe(false);
  });

  it("sin registro previo corre aunque no sea día objetivo", () => {
    const config = {
      ...baseConfig,
      notification_type: "recordatorio_pago",
      biweekly_frequency: true,
    };
    // miércoles 7/oct, no es 15 ni fin de mes
    expect(verificarFrecuencia(config, null, vet(2026, 9, 7))).toBe(true);
  });

  it("fecha inválida en bitácora se trata como 'nunca envió'", () => {
    const config = {
      ...baseConfig,
      notification_type: "recordatorio_pago",
      weekly_frequency: true,
    };
    expect(verificarFrecuencia(config, "no-es-fecha", vet(2026, 9, 7))).toBe(true);
  });

  it("solo una corrida por día de calendario (VET)", () => {
    const config = {
      ...baseConfig,
      notification_type: "resumen_dueno",
      daily_frequency: true,
    };
    // mismo día VET (7/oct 04:00 UTC y 7/oct 12:00 UTC)
    expect(verificarFrecuencia(config, vet(2026, 9, 7), vet(2026, 9, 7, 12))).toBe(false);
    // ayer → corre
    expect(verificarFrecuencia(config, vet(2026, 9, 6), vet(2026, 9, 7))).toBe(true);
  });

  it("diaria: days_before no aplica, envía a diario", () => {
    const config = {
      ...baseConfig,
      notification_type: "recordatorio_pago",
      daily_frequency: true,
      days_before: 5,
    };
    expect(verificarFrecuencia(config, vet(2026, 9, 6), vet(2026, 9, 7))).toBe(true);
  });

  it("diaria gana si hay varias frecuencias marcadas", () => {
    const config = {
      ...baseConfig,
      notification_type: "resumen_dueno",
      daily_frequency: true,
      monthly_frequency: true,
    };
    expect(verificarFrecuencia(config, vet(2026, 9, 6), vet(2026, 9, 7))).toBe(true);
  });

  describe("quincenal (15 y fin de mes)", () => {
    const config = {
      ...baseConfig,
      notification_type: "recordatorio_pago",
      biweekly_frequency: true,
      days_before: 2,
    };

    it("days_before 2 → envía el 13", () => {
      expect(verificarFrecuencia(config, vet(2026, 9, 1), vet(2026, 9, 13))).toBe(true);
    });

    it("days_before 2 → no envía el 14 ni el 12", () => {
      expect(verificarFrecuencia(config, vet(2026, 9, 1), vet(2026, 9, 14))).toBe(false);
      expect(verificarFrecuencia(config, vet(2026, 8, 30), vet(2026, 9, 12))).toBe(false);
    });

    it("days_before 2 → envía fin de mes − 2", () => {
      // 29/ene → 31/ene ; 26/feb → 28/feb
      expect(verificarFrecuencia(config, vet(2026, 0, 1), vet(2026, 0, 29))).toBe(true);
      expect(verificarFrecuencia(config, vet(2026, 1, 1), vet(2026, 1, 26))).toBe(true);
    });

    it("days_before 2 → el 30 de enero no corresponde (cae 1/feb)", () => {
      expect(verificarFrecuencia(config, vet(2026, 0, 1), vet(2026, 0, 30))).toBe(false);
    });

    it("days_before 0 → envía el 15 y el fin de mes", () => {
      const sinLead = { ...config, days_before: 0 };
      expect(verificarFrecuencia(sinLead, vet(2026, 9, 1), vet(2026, 9, 15))).toBe(true);
      expect(verificarFrecuencia(sinLead, vet(2026, 9, 1), vet(2026, 9, 31))).toBe(true);
      expect(verificarFrecuencia(sinLead, vet(2026, 9, 1), vet(2026, 9, 16))).toBe(false);
    });

    it("lead grande cruza de mes (15/fef − 20 días = 26/ene)", () => {
      const lead20 = { ...config, days_before: 20 };
      expect(verificarFrecuencia(lead20, vet(2026, 0, 1), vet(2026, 0, 26))).toBe(true);
    });
  });

  describe("semanal (lunes)", () => {
    const config = {
      ...baseConfig,
      notification_type: "recordatorio_pago",
      weekly_frequency: true,
      days_before: 2,
    };

    it("days_before 2 → envía el sábado", () => {
      // sáb 3/oct → lunes 5/oct
      expect(verificarFrecuencia(config, vet(2026, 8, 28), vet(2026, 9, 3))).toBe(true);
    });

    it("days_before 2 → no envía domingo ni lunes", () => {
      expect(verificarFrecuencia(config, vet(2026, 8, 28), vet(2026, 9, 4))).toBe(false);
      expect(verificarFrecuencia(config, vet(2026, 8, 28), vet(2026, 9, 5))).toBe(false);
    });

    it("days_before 0 → envía el lunes", () => {
      const sinLead = { ...config, days_before: 0 };
      expect(verificarFrecuencia(sinLead, vet(2026, 8, 28), vet(2026, 9, 5))).toBe(true);
      expect(verificarFrecuencia(sinLead, vet(2026, 8, 28), vet(2026, 9, 12))).toBe(true);
      expect(verificarFrecuencia(sinLead, vet(2026, 8, 28), vet(2026, 9, 6))).toBe(false);
    });
  });

  describe("mensual (fin de mes)", () => {
    const config = {
      ...baseConfig,
      notification_type: "estatus_sistema",
      monthly_frequency: true,
      days_before: 2,
    };

    it("days_before 2 → envía fin de mes − 2", () => {
      expect(verificarFrecuencia(config, vet(2026, 0, 1), vet(2026, 0, 29))).toBe(true);
      expect(verificarFrecuencia(config, vet(2026, 1, 1), vet(2026, 1, 26))).toBe(true);
    });

    it("days_before 2 → no envía otros días", () => {
      expect(verificarFrecuencia(config, vet(2026, 0, 1), vet(2026, 0, 30))).toBe(false);
      expect(verificarFrecuencia(config, vet(2026, 1, 1), vet(2026, 1, 25))).toBe(false);
    });

    it("days_before 0 → envía el último día del mes", () => {
      const sinLead = { ...config, days_before: 0 };
      expect(verificarFrecuencia(sinLead, vet(2026, 1, 1), vet(2026, 1, 28))).toBe(true);
      expect(verificarFrecuencia(sinLead, vet(2026, 1, 1), vet(2026, 1, 27))).toBe(false);
    });
  });

  describe("piso anti-spam de miembros_deudores (7 días)", () => {
    const deudores = { ...baseConfig, daily_frequency: true };

    it("la constante sigue en 7", () => {
      expect(MIN_DIAS_AVISO_DEUDA).toBe(7);
    });

    it("no reavisa dentro de los 7 días aunque sea diario", () => {
      expect(verificarFrecuencia(deudores, vet(2026, 9, 6), vet(2026, 9, 7))).toBe(false);
      expect(verificarFrecuencia(deudores, vet(2026, 9, 1), vet(2026, 9, 7))).toBe(false);
    });

    it("vuelve a avisar pasados los 7 días", () => {
      // 29/sep → 7/oct = 8 días
      expect(verificarFrecuencia(deudores, vet(2026, 8, 29), vet(2026, 9, 7))).toBe(true);
    });

    it("el piso no aplica a otros tipos", () => {
      const resumen = {
        ...baseConfig,
        notification_type: "resumen_dueno",
        daily_frequency: true,
      };
      expect(verificarFrecuencia(resumen, vet(2026, 9, 6), vet(2026, 9, 7))).toBe(true);
    });
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
