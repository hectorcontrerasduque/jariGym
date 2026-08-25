import { describe, it, expect } from "vitest";
import { resetPasswordTemplate } from "@/lib/services/email/templates/reset-password";
import { estatusSistemaTemplate } from "@/lib/services/email/templates/estatus-sistema";
import { resumenDuenoTemplate } from "@/lib/services/email/templates/resumen-dueno";

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
    expect(html).toContain("Gestión de gimnasio inteligente");
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
