import { describe, it, expect } from "vitest";
import { resetPasswordTemplate } from "@/lib/services/email/templates/reset-password";

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
