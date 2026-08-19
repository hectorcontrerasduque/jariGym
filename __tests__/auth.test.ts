import { describe, it, expect } from "vitest";
import { messages } from "@/lib/messages";

describe("Auth messages", () => {
  it("should have all reset password messages", () => {
    const auth = messages.auth;
    expect(auth.resetPasswordTitle).toBeDefined();
    expect(auth.resetPasswordSubtitle).toBeDefined();
    expect(auth.resetPasswordSent).toBeDefined();
    expect(auth.resetPasswordButton).toBeDefined();
    expect(auth.resetPasswordCancelButton).toBeDefined();
    expect(auth.resetPasswordCloseButton).toBeDefined();
    expect(auth.resetPasswordError).toBeDefined();
    expect(auth.resetPasswordPageTitle).toBeDefined();
    expect(auth.resetPasswordNewPassword).toBeDefined();
    expect(auth.resetPasswordConfirmPassword).toBeDefined();
    expect(auth.resetPasswordSubmit).toBeDefined();
    expect(auth.resetPasswordSuccess).toBeDefined();
    expect(auth.resetPasswordInvalidToken).toBeDefined();
    expect(auth.resetPasswordTokenExpired).toBeDefined();
    expect(auth.resetPasswordPasswordMismatch).toBeDefined();
    expect(auth.resetPasswordWeakPassword).toBeDefined();
  });

  it("should have login messages", () => {
    const auth = messages.auth;
    expect(auth.loginTitle).toBeDefined();
    expect(auth.loginButton).toBeDefined();
    expect(auth.loginWithGoogle).toBeDefined();
    expect(auth.forgotPassword).toBeDefined();
    expect(auth.invalidCredentials).toBeDefined();
    expect(auth.emailNotConfirmed).toBeDefined();
    expect(auth.userNotFound).toBeDefined();
    expect(auth.tooManyRequests).toBeDefined();
  });

  it("all reset messages should be in Spanish", () => {
    const auth = messages.auth;
    expect(auth.resetPasswordTitle).toMatch(/[áéíóúñ]/i);
    expect(auth.resetPasswordSent).toContain("Correo");
    expect(auth.resetPasswordError).toContain("Error");
    expect(auth.resetPasswordInvalidToken).toContain("enlace");
    expect(auth.resetPasswordTokenExpired).toContain("expiró");
    expect(auth.resetPasswordPasswordMismatch).toContain("coinciden");
    expect(auth.resetPasswordWeakPassword).toContain("6 caracteres");
  });
});
