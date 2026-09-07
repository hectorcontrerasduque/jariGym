import { test, expect } from "@playwright/test";

test.describe("Google OAuth Login", () => {
  test("login with Google redirects to /dashboard", async ({ page }) => {
    // Ir a la pagina de login
    await page.goto("http://localhost:3000/login");

    // Verificar que la pagina carga correctamente
    await page.waitForLoadState("networkidle");

    // Hacer click en "Continue with Google"
    const googleButton = page.locator("button", { hasText: /google|continuar con/i });
    await expect(googleButton).toBeVisible({ timeout: 10000 });
    await googleButton.click();

    // Esperar a que redirija a Google
    await page.waitForURL(/accounts\.google\.com/, { timeout: 15000 });

    // ============================================
    // AQUI EL USUARIO DEBE COMPLETAR EL LOGIN
    // MANUALMENTE EN EL NAVEGADOR
    // ============================================
    console.log("\n========================================");
    console.log("  COMPLETA EL LOGIN EN GOOGLE");
    console.log("  Usa: hectocontrerasduque@gmail.com");
    console.log("========================================\n");

    // Esperar a que redirija al dashboard (max 120 segundos para login manual)
    try {
      await page.waitForURL("**/dashboard**", { timeout: 120000 });
      console.log("\n✅ LOGIN EXITOSO - Redirigido a /dashboard\n");
      expect(page.url()).toContain("/dashboard");
    } catch {
      // Si no llega a /dashboard, capturar la URL actual
      const currentUrl = page.url();
      console.log(`\n❌ LOGIN FALLIDO - URL actual: ${currentUrl}\n`);

      // Capturar screenshot del error
      await page.screenshot({ path: "test-results/login-error.png" });

      // Verificar si hay algun mensaje de error visible
      const errorText = await page.locator("text=/error|no autorizado|no registrado/i").first().textContent().catch(() => null);
      if (errorText) {
        console.log(`   Mensaje de error: ${errorText}\n`);
      }

      throw new Error(`Login no redirigio a /dashboard. URL actual: ${currentUrl}`);
    }
  });
});
