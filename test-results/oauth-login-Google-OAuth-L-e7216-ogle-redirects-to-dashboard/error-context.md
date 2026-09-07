# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oauth-login.spec.ts >> Google OAuth Login >> login with Google redirects to /dashboard
- Location: e2e\oauth-login.spec.ts:4:3

# Error details

```
Error: Login no redirigio a /dashboard. URL actual: https://accounts.google.com/v3/signin/identifier?opparams=%253Fredirect_to%253Dhttp%25253A%25252F%25252Flocalhost%25253A3000%25252Fauth%25252Fcallback&dsh=S638543906%3A1788623949712700&client_id=962347041987-n53ueupgnk26o52nfedj9oqo5c1v9ahp.apps.googleusercontent.com&o2v=2&prompt=select_account&redirect_uri=https%3A%2F%2Fszcxzabtrpdzwmaevsbh.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email+profile&service=lso&state=beaab05e-5a1e-48e6-b9b4-3822be0249b7&flowName=GeneralOAuthFlow&continue=https%3A%2F%2Faccounts.google.com%2Fsignin%2Foauth%2Fv3%2Fconsent%3Fauthuser%3Dunknown%26part%3DAJi8hAPc8cfd2XN1a2-S9NlWegoBhoEjVK0Bln1RWzv8v23BW8nhyCDJ5TYcOaKI9NRR8-jMYkL_pPPeaYO8rV6ZdUlGSa2Q1rjkkECzFw5Qsnx4xHh9rDHC7laQtKM0A-2pXnUeGepaK3XnAaAnhQn5yrtySU6X7s2Uxy5BHkSL5EVE1LTwuR7vVY6FOe6l23SrW2ym_kZobLlF8szuThvWkKXAqD1tn4A3vvOxNILl4KdOQALA7HmUA2fCcDS9MVeWBrA0m38QxY5yktz5y6nWZvjlQQVQsn45a6Z2W3QcIjp5IWNl0uFInzx1zmcA_cOo9W9twV71Hjmyccm23jsbBeYeGg70JGdpcfUYzIqmmXLQHEkjzIVqQN8Q7YG9_CMVuKYm9g4iAkXUzFux-WMwTYF0JYbKYMG2_zxhtbdjaijMSbSuvIlwBKRFnh23pdspJCCnWt1L9l_4hmjGKukHUlHP2cttEpnOlTyLuZYHrfGUyriIAUs%26flowName%3DGeneralOAuthFlow%26as%3DS638543906%253A1788623949712700%26client_id%3D962347041987-n53ueupgnk26o52nfedj9oqo5c1v9ahp.apps.googleusercontent.com%26requestPath%3D%252Fsignin%252Foauth%252Fv3%252Fconsent%23&app_domain=https%3A%2F%2Fszcxzabtrpdzwmaevsbh.supabase.co&rart=ANgoxccA2IChiDuo1auxysZ900UOAPKPgWmLrTuAlGRLE2US19YG-wenMjWOPU_3KjGf0LOKeTGHGSi2IfMVrwSitMXlbl4x7BwSbwd_yuuAoWct5f6QPDI
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e3]:
    - generic [ref=f1e4]:
      - generic [aria-hidden] [ref=f1e6]:
        - generic [ref=f1e7]: Loading
        - progressbar [aria-hidden] [ref=f1e8]
      - main [ref=f1e15]:
        - generic [ref=f1e16]:
          - generic [ref=f1e17]: Sign in with Google
          - generic [ref=f1e23]:
            - heading "Sign in" [level=1] [ref=f1e24]
            - generic [ref=f1e26]:
              - text: to continue to
              - button "szcxzabtrpdzwmaevsbh.supabase.co" [ref=f1e27] [cursor=pointer]
        - generic [ref=f1e35]:
          - generic [ref=f1e40]:
            - textbox "Email or phone" [ref=f1e41]
            - generic [aria-hidden]: Email or phone
          - button "Forgot email?" [ref=f1e45] [cursor=pointer]
        - generic [ref=f1e47]:
          - button "Next" [ref=f1e51]
          - button "Create account" [ref=f1e59]
    - contentinfo [ref=f1e66]:
      - combobox "Change language English (United States)" [ref=f1e70] [cursor=pointer]:
        - generic [aria-hidden]:
          - generic: English (United States)
      - list [ref=f1e72]:
        - listitem [ref=f1e73]:
          - link "Open Google Account Help Center (external, opens in a new window)" [ref=f1e74] [cursor=pointer]:
            - /url: https://support.google.com/accounts?hl=en-US&p=account_iph
            - text: Help
        - listitem [ref=f1e75]:
          - link "Privacy Policy (external, opens in a new window)" [ref=f1e76] [cursor=pointer]:
            - /url: https://accounts.google.com/TOS?loc=VE&hl=en-US&privacy=true
            - text: Privacy
        - listitem [ref=f1e77]:
          - link "Google Terms of Service (external, opens in a new window)" [ref=f1e78] [cursor=pointer]:
            - /url: https://accounts.google.com/TOS?loc=VE&hl=en-US
            - text: Terms
  - iframe [ref=f1e79]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Google OAuth Login", () => {
  4  |   test("login with Google redirects to /dashboard", async ({ page }) => {
  5  |     // Ir a la pagina de login
  6  |     await page.goto("http://localhost:3000/login");
  7  | 
  8  |     // Verificar que la pagina carga correctamente
  9  |     await page.waitForLoadState("networkidle");
  10 | 
  11 |     // Hacer click en "Continue with Google"
  12 |     const googleButton = page.locator("button", { hasText: /google|continuar con/i });
  13 |     await expect(googleButton).toBeVisible({ timeout: 10000 });
  14 |     await googleButton.click();
  15 | 
  16 |     // Esperar a que redirija a Google
  17 |     await page.waitForURL(/accounts\.google\.com/, { timeout: 15000 });
  18 | 
  19 |     // ============================================
  20 |     // AQUI EL USUARIO DEBE COMPLETAR EL LOGIN
  21 |     // MANUALMENTE EN EL NAVEGADOR
  22 |     // ============================================
  23 |     console.log("\n========================================");
  24 |     console.log("  COMPLETA EL LOGIN EN GOOGLE");
  25 |     console.log("  Usa: hectocontrerasduque@gmail.com");
  26 |     console.log("========================================\n");
  27 | 
  28 |     // Esperar a que redirija al dashboard (max 120 segundos para login manual)
  29 |     try {
  30 |       await page.waitForURL("**/dashboard**", { timeout: 120000 });
  31 |       console.log("\n✅ LOGIN EXITOSO - Redirigido a /dashboard\n");
  32 |       expect(page.url()).toContain("/dashboard");
  33 |     } catch {
  34 |       // Si no llega a /dashboard, capturar la URL actual
  35 |       const currentUrl = page.url();
  36 |       console.log(`\n❌ LOGIN FALLIDO - URL actual: ${currentUrl}\n`);
  37 | 
  38 |       // Capturar screenshot del error
  39 |       await page.screenshot({ path: "test-results/login-error.png" });
  40 | 
  41 |       // Verificar si hay algun mensaje de error visible
  42 |       const errorText = await page.locator("text=/error|no autorizado|no registrado/i").first().textContent().catch(() => null);
  43 |       if (errorText) {
  44 |         console.log(`   Mensaje de error: ${errorText}\n`);
  45 |       }
  46 | 
> 47 |       throw new Error(`Login no redirigio a /dashboard. URL actual: ${currentUrl}`);
     |             ^ Error: Login no redirigio a /dashboard. URL actual: https://accounts.google.com/v3/signin/identifier?opparams=%253Fredirect_to%253Dhttp%25253A%25252F%25252Flocalhost%25253A3000%25252Fauth%25252Fcallback&dsh=S638543906%3A1788623949712700&client_id=962347041987-n53ueupgnk26o52nfedj9oqo5c1v9ahp.apps.googleusercontent.com&o2v=2&prompt=select_account&redirect_uri=https%3A%2F%2Fszcxzabtrpdzwmaevsbh.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email+profile&service=lso&state=beaab05e-5a1e-48e6-b9b4-3822be0249b7&flowName=GeneralOAuthFlow&continue=https%3A%2F%2Faccounts.google.com%2Fsignin%2Foauth%2Fv3%2Fconsent%3Fauthuser%3Dunknown%26part%3DAJi8hAPc8cfd2XN1a2-S9NlWegoBhoEjVK0Bln1RWzv8v23BW8nhyCDJ5TYcOaKI9NRR8-jMYkL_pPPeaYO8rV6ZdUlGSa2Q1rjkkECzFw5Qsnx4xHh9rDHC7laQtKM0A-2pXnUeGepaK3XnAaAnhQn5yrtySU6X7s2Uxy5BHkSL5EVE1LTwuR7vVY6FOe6l23SrW2ym_kZobLlF8szuThvWkKXAqD1tn4A3vvOxNILl4KdOQALA7HmUA2fCcDS9MVeWBrA0m38QxY5yktz5y6nWZvjlQQVQsn45a6Z2W3QcIjp5IWNl0uFInzx1zmcA_cOo9W9twV71Hjmyccm23jsbBeYeGg70JGdpcfUYzIqmmXLQHEkjzIVqQN8Q7YG9_CMVuKYm9g4iAkXUzFux-WMwTYF0JYbKYMG2_zxhtbdjaijMSbSuvIlwBKRFnh23pdspJCCnWt1L9l_4hmjGKukHUlHP2cttEpnOlTyLuZYHrfGUyriIAUs%26flowName%3DGeneralOAuthFlow%26as%3DS638543906%253A1788623949712700%26client_id%3D962347041987-n53ueupgnk26o52nfedj9oqo5c1v9ahp.apps.googleusercontent.com%26requestPath%3D%252Fsignin%252Foauth%252Fv3%252Fconsent%23&app_domain=https%3A%2F%2Fszcxzabtrpdzwmaevsbh.supabase.co&rart=ANgoxccA2IChiDuo1auxysZ900UOAPKPgWmLrTuAlGRLE2US19YG-wenMjWOPU_3KjGf0LOKeTGHGSi2IfMVrwSitMXlbl4x7BwSbwd_yuuAoWct5f6QPDI
  48 |     }
  49 |   });
  50 | });
  51 | 
```