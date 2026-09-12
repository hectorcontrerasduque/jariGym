import { describe, it, expect } from "vitest";
import { resetPasswordTemplate } from "@/lib/services/email/templates/reset-password";
import { estatusSistemaTemplate } from "@/lib/services/email/templates/estatus-sistema";
import { resumenDuenoTemplate } from "@/lib/services/email/templates/resumen-dueno";
import { welcomeTemplate } from "@/lib/services/email/templates/welcome";
import { pagoAprobadoTemplate } from "@/lib/services/email/templates/pago-aprobado";
import { pagoRechazadoTemplate } from "@/lib/services/email/templates/pago-rechazado";
import { deudasPendientesTemplate } from "@/lib/services/email/templates/deudas-pendientes";
import { recordatorioMiembroTemplate } from "@/lib/services/email/templates/recordatorio-miembro";
import { recordatorioAdminTemplate } from "@/lib/services/email/templates/recordatorio-admin";
import { diagnosticoTemplate } from "@/lib/services/email/templates/diagnostico";
import { errorReportTemplate } from "@/lib/services/email/templates/error-report";

describe("resetPasswordTemplate", () => {
  const gymName = "Mi Gym";
  const resetLink = "https://example.com/reset-password?token=abc123";

  it("should include gym name in header", () => {
    const html = resetPasswordTemplate(resetLink, gymName, null);
    expect(html).toContain(gymName);
  });

  it("should include reset link", () => {
    const html = resetPasswordTemplate(resetLink, gymName, null);
    expect(html).toContain(resetLink);
  });

  it("should render logo img when logoUrl provided", () => {
    const logoUrl = "https://example.com/logo.png";
    const html = resetPasswordTemplate(resetLink, gymName, logoUrl);
    expect(html).toContain(`<img src="${logoUrl}"`);
    expect(html).toContain(`alt="${gymName}"`);
  });

  it("should render initial fallback when no logo", () => {
    const html = resetPasswordTemplate(resetLink, gymName, null);
    expect(html).toContain("M");
    expect(html).not.toContain("<img");
  });

  it("should include Spanish text", () => {
    const html = resetPasswordTemplate(resetLink, gymName, null);
    expect(html).toContain("Restablecer Contraseña");
    expect(html).toContain("Hola,");
    expect(html).toContain("expira en 24 horas");
  });

  it("should have gym name in footer", () => {
    const html = resetPasswordTemplate(resetLink, gymName, null);
    expect(html).toContain(gymName);
  });

  it("should use app color scheme", () => {
    const html = resetPasswordTemplate(resetLink, gymName, null);
    expect(html).toContain("#1e293b");
    expect(html).toContain("#38bdf8");
  });
});

describe("estatusSistemaTemplate", () => {
  const gymName = "Mi Gym";
  const metricas = {
    totalMiembrosActivos: 25,
    totalMiembrosInactivos: 5,
    pagosAprobadosMes: 20,
    pagosPendientesMes: 3,
    montoRecaudadoMes: 500,
    montoPendienteMes: 75,
    capacidad: 25,
    maxMiembros: 50,
    ultimoMiembroRegistrado: "Juan Pérez",
    ultimoPagoRegistrado: "2026-08-15",
    migraciones: 10,
  };

  it("should include gym name", () => {
    const html = estatusSistemaTemplate(gymName, metricas);
    expect(html).toContain(gymName);
  });

  it("should include member counts", () => {
    const html = estatusSistemaTemplate(gymName, metricas);
    expect(html).toContain("25");
    expect(html).toContain("5");
  });

  it("should include payment stats", () => {
    const html = estatusSistemaTemplate(gymName, metricas);
    expect(html).toContain("20");
    expect(html).toContain("3");
  });

  it("should include capacity info", () => {
    const html = estatusSistemaTemplate(gymName, metricas);
    expect(html).toContain("25");
    expect(html).toContain("50");
  });

  it("should include last registered member", () => {
    const html = estatusSistemaTemplate(gymName, metricas);
    expect(html).toContain("Juan Pérez");
  });

  it("should include migration count", () => {
    const html = estatusSistemaTemplate(gymName, metricas);
    expect(html).toContain("10");
  });

  it("should render logo when provided", () => {
    const logoUrl = "https://example.com/logo.png";
    const html = estatusSistemaTemplate(gymName, metricas, logoUrl);
    expect(html).toContain(`<img src="${logoUrl}"`);
  });

  it("should include error logs section when provided", () => {
    const errores = [
      { tipo: "email", fecha: "2026-08-20", detalle: "SMTP timeout" },
    ];
    const html = estatusSistemaTemplate(gymName, metricas, null, errores);
    expect(html).toContain("SMTP timeout");
    expect(html).toContain("email");
  });

  it("should handle no error logs", () => {
    const html = estatusSistemaTemplate(gymName, metricas, null, []);
    expect(html).toContain(gymName);
  });
});

describe("resumenDuenoTemplate", () => {
  const gymName = "Mi Gym";
  const appUrl = "https://app.example.com";
  const resumen = {
    pagosAprobados: 15,
    pagosPendientes: 4,
    montoCobrado: 375,
    montoPendiente: 100,
    miembrosAlDia: 12,
    miembrosDeudores: 3,
    migraciones: 8,
  };

  it("should include gym name", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl);
    expect(html).toContain(gymName);
  });

  it("should include payment counts", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl);
    expect(html).toContain("15");
    expect(html).toContain("4");
  });

  it("should include monetary amounts", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl);
    expect(html).toContain("375");
    expect(html).toContain("100");
  });

  it("should include member status", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl);
    expect(html).toContain("12");
    expect(html).toContain("3");
  });

  it("should include migration count", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl);
    expect(html).toContain("8");
  });

  it("should include app URL", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl);
    expect(html).toContain(appUrl);
  });

  it("should render logo when provided", () => {
    const logoUrl = "https://example.com/logo.png";
    const html = resumenDuenoTemplate(gymName, resumen, appUrl, logoUrl);
    expect(html).toContain(`<img src="${logoUrl}"`);
  });

  it("should render initial fallback when no logo", () => {
    const html = resumenDuenoTemplate(gymName, resumen, appUrl, null);
    expect(html).toContain("M");
    expect(html).not.toContain("<img");
  });
});

// ─── welcomeTemplate ─────────────────────────────────────────

describe("welcomeTemplate", () => {
  const gymName = "Mi Gym";

  it("shows credentials when password provided", () => {
    const html = welcomeTemplate("user@test.com", "abc123", gymName);
    expect(html).toContain("user@test.com");
    expect(html).toContain("abc123");
    expect(html).toContain("Contraseña");
  });

  it("shows Google message when isOAuth", () => {
    const html = welcomeTemplate("user@test.com", "", gymName, null, undefined, true);
    expect(html).toContain("Google");
    expect(html).not.toContain("Contraseña");
  });

  it("shows migration message when no password and no OAuth", () => {
    const html = welcomeTemplate("user@test.com", "", gymName);
    expect(html).toContain("Migrados");
    expect(html).toContain("iniciar sesión");
  });

  it("includes confirm button when confirmLink provided", () => {
    const link = "https://example.com/confirm?token=abc";
    const html = welcomeTemplate("user@test.com", "abc123", gymName, null, link);
    expect(html).toContain(link);
    expect(html).toContain("Confirmar mi correo");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = welcomeTemplate("user@test.com", "abc123", gymName, logo);
    expect(html).toContain(`<img src="${logo}"`);
  });

  it("renders initial fallback when no logo", () => {
    const html = welcomeTemplate("user@test.com", "abc123", gymName, null);
    expect(html).toContain("M");
    expect(html).not.toContain("<img");
  });

  it("includes gym name in header", () => {
    const html = welcomeTemplate("user@test.com", "abc123", gymName);
    expect(html).toContain(gymName);
  });
});

// ─── pagoAprobadoTemplate ────────────────────────────────────

describe("pagoAprobadoTemplate", () => {
  const gymName = "Mi Gym";
  const meses = [
    { month_number: 8, year_number: 2026 },
    { month_number: 9, year_number: 2026 },
  ];

  it("includes member name and amount", () => {
    const html = pagoAprobadoTemplate("Juan", gymName, 50, meses, "efectivo");
    expect(html).toContain("Juan");
    expect(html).toContain("$50.00");
  });

  it("includes month names", () => {
    const html = pagoAprobadoTemplate("Juan", gymName, 50, meses, "efectivo");
    expect(html).toContain("Agosto 2026");
    expect(html).toContain("Septiembre 2026");
  });

  it("shows Inscripción when no months", () => {
    const html = pagoAprobadoTemplate("Juan", gymName, 10, [], "efectivo");
    expect(html).toContain("Inscripción");
  });

  it("includes payment method", () => {
    const html = pagoAprobadoTemplate("Juan", gymName, 50, meses, "binance");
    expect(html).toContain("binance");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = pagoAprobadoTemplate("Juan", gymName, 50, meses, "efectivo", logo);
    expect(html).toContain(`<img src="${logo}"`);
  });

  it("renders green fallback when no logo", () => {
    const html = pagoAprobadoTemplate("Juan", gymName, 50, meses, "efectivo", null);
    expect(html).toContain("#22c55e");
    expect(html).not.toContain("<img");
  });
});

// ─── pagoRechazadoTemplate ───────────────────────────────────

describe("pagoRechazadoTemplate", () => {
  const gymName = "Mi Gym";
  const meses = [{ month_number: 8, year_number: 2026 }];

  it("includes member name, amount and motivo", () => {
    const html = pagoRechazadoTemplate("Juan", gymName, 50, meses, "efectivo", "Comprobante ilegible");
    expect(html).toContain("Juan");
    expect(html).toContain("$50.00");
    expect(html).toContain("Comprobante ilegible");
  });

  it("includes rejection header", () => {
    const html = pagoRechazadoTemplate("Juan", gymName, 50, meses, "efectivo", "Motivo");
    expect(html).toContain("Pago Rechazado");
    expect(html).toContain("rechazado");
  });

  it("shows Inscripción when no months", () => {
    const html = pagoRechazadoTemplate("Juan", gymName, 10, [], "efectivo", "Motivo");
    expect(html).toContain("Inscripción");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = pagoRechazadoTemplate("Juan", gymName, 50, meses, "efectivo", "Motivo", logo);
    expect(html).toContain(`<img src="${logo}"`);
  });

  it("renders red fallback when no logo", () => {
    const html = pagoRechazadoTemplate("Juan", gymName, 50, meses, "efectivo", "Motivo", null);
    expect(html).toContain("#ef4444");
    expect(html).not.toContain("<img");
  });
});

// ─── deudasPendientesTemplate ────────────────────────────────

describe("deudasPendientesTemplate", () => {
  const gymName = "Mi Gym";
  const deudas = [
    { month_number: 7, year_number: 2026, payment_amount: 25 },
    { month_number: 8, year_number: 2026, payment_amount: 25 },
  ];

  it("includes member name", () => {
    const html = deudasPendientesTemplate("Juan", gymName, deudas, 50);
    expect(html).toContain("Juan");
  });

  it("includes month names and amounts", () => {
    const html = deudasPendientesTemplate("Juan", gymName, deudas, 50);
    expect(html).toContain("Julio 2026");
    expect(html).toContain("Agosto 2026");
    expect(html).toContain("$25.00");
  });

  it("includes total", () => {
    const html = deudasPendientesTemplate("Juan", gymName, deudas, 50);
    expect(html).toContain("$50.00");
    expect(html).toContain("TOTAL");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = deudasPendientesTemplate("Juan", gymName, deudas, 50, logo);
    expect(html).toContain(`<img src="${logo}"`);
  });

  it("renders fallback when no logo", () => {
    const html = deudasPendientesTemplate("Juan", gymName, deudas, 50, null);
    expect(html).toContain("M");
    expect(html).not.toContain("<img");
  });
});

// ─── recordatorioMiembroTemplate ─────────────────────────────

describe("recordatorioMiembroTemplate", () => {
  const gymName = "Mi Gym";

  it("includes member name and days remaining", () => {
    const html = recordatorioMiembroTemplate("Juan", gymName, 3, "15/09/2026");
    expect(html).toContain("Juan");
    expect(html).toContain("3 días");
  });

  it("uses singular 'día' when 1 day remaining", () => {
    const html = recordatorioMiembroTemplate("Juan", gymName, 1, "13/09/2026");
    expect(html).toContain("1 día");
    expect(html).not.toContain("1 días");
  });

  it("includes expiration date", () => {
    const html = recordatorioMiembroTemplate("Juan", gymName, 5, "17/09/2026");
    expect(html).toContain("17/09/2026");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = recordatorioMiembroTemplate("Juan", gymName, 3, "15/09/2026", logo);
    expect(html).toContain(`<img src="${logo}"`);
  });
});

// ─── recordatorioAdminTemplate ───────────────────────────────

describe("recordatorioAdminTemplate", () => {
  const gymName = "Mi Gym";
  const miembros = [
    { nombre: "Juan", diasRestantes: 3, fechaVencimiento: "15/09/2026" },
    { nombre: "María", diasRestantes: 5, fechaVencimiento: "17/09/2026" },
  ];

  it("includes admin name and member list", () => {
    const html = recordatorioAdminTemplate("Admin", gymName, miembros);
    expect(html).toContain("Admin");
    expect(html).toContain("Juan");
    expect(html).toContain("María");
  });

  it("includes days remaining for each member", () => {
    const html = recordatorioAdminTemplate("Admin", gymName, miembros);
    expect(html).toContain("3 días");
    expect(html).toContain("5 días");
  });

  it("shows empty message when no members", () => {
    const html = recordatorioAdminTemplate("Admin", gymName, []);
    expect(html).toContain("No hay miembros");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = recordatorioAdminTemplate("Admin", gymName, miembros, logo);
    expect(html).toContain(`<img src="${logo}"`);
  });
});

// ─── diagnosticoTemplate ─────────────────────────────────────

describe("diagnosticoTemplate", () => {
  const gymName = "Mi Gym";
  const resultados = [
    { paso: "Supabase", estado: "ok" as const, detalle: "Conectado" },
    { paso: "Email", estado: "warning" as const, detalle: "Lento" },
    { paso: "Storage", estado: "error" as const, detalle: "No responde" },
  ];

  it("includes gym name", () => {
    const html = diagnosticoTemplate(resultados, gymName);
    expect(html).toContain(gymName);
  });

  it("shows error status when any error exists", () => {
    const html = diagnosticoTemplate(resultados, gymName);
    expect(html).toContain("Problemas hallados");
  });

  it("shows ok status when all ok", () => {
    const allOk = [
      { paso: "Supabase", estado: "ok" as const, detalle: "Conectado" },
    ];
    const html = diagnosticoTemplate(allOk, gymName);
    expect(html).toContain("Todo OK");
  });

  it("includes step names and details", () => {
    const html = diagnosticoTemplate(resultados, gymName);
    expect(html).toContain("Supabase");
    expect(html).toContain("Conectado");
    expect(html).toContain("Email");
    expect(html).toContain("Lento");
    expect(html).toContain("Storage");
    expect(html).toContain("No responde");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = diagnosticoTemplate(resultados, gymName, logo);
    expect(html).toContain(`<img src="${logo}"`);
  });
});

// ─── errorReportTemplate ─────────────────────────────────────

describe("errorReportTemplate", () => {
  const gymName = "Mi Gym";
  const errorInfo = {
    paso: "Enviar email",
    mensaje: "SMTP timeout",
    timestamp: "2026-09-12 10:30:00",
    contexto: { userId: "user-1", email: "test@test.com" },
  };

  it("includes error step and message", () => {
    const html = errorReportTemplate(errorInfo, gymName);
    expect(html).toContain("Enviar email");
    expect(html).toContain("SMTP timeout");
  });

  it("includes timestamp", () => {
    const html = errorReportTemplate(errorInfo, gymName);
    expect(html).toContain("2026-09-12 10:30:00");
  });

  it("includes context keys and values", () => {
    const html = errorReportTemplate(errorInfo, gymName);
    expect(html).toContain("userId");
    expect(html).toContain("user-1");
    expect(html).toContain("test@test.com");
  });

  it("renders logo when provided", () => {
    const logo = "https://example.com/logo.png";
    const html = errorReportTemplate(errorInfo, gymName, logo);
    expect(html).toContain(`<img src="${logo}"`);
  });

  it("renders fallback when no logo", () => {
    const html = errorReportTemplate(errorInfo, gymName, null);
    expect(html).toContain("M");
    expect(html).not.toContain("<img");
  });
});
