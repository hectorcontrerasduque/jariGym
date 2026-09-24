#!/usr/bin/env node
/**
 * Dashboard load benchmark against a running app (use the LOCAL Supabase: npm run db:local:reset).
 *
 *   node scripts/bench-dashboard.mjs [baseUrl=http://localhost:3000] [runs=7] [latencyMs=150]
 *
 * Logs in as the seed admin, emulates a mobile network (latency + bandwidth via CDP),
 * reloads /dashboard `runs` times and reports, per load:
 *   - ms until the dashboard shows data (loader gone and "Pagos por Mes" visible)
 *   - requests and bytes to Supabase
 * Also writes the dashboard's visible text to <outDir>/dashboard-text.txt so two versions
 * of the app can be diffed for identical output, then switches the year selector to
 * BENCH_YEAR (default: last year) and back, saving dashboard-text-<year>.txt and
 * dashboard-text-back.txt.
 *
 * Env: BENCH_EMAIL (default admin@gym.local), BENCH_READY (text that means "loaded";
 * default "Pagos por Mes", use "Pagos Pendientes" for a miembro).
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [baseUrl = "http://localhost:3000", runsArg = "7", latencyArg = "150", outDir = "bench-out"] = process.argv.slice(2);
const RUNS = Number(runsArg);
const LATENCY = Number(latencyArg);
const SUPABASE = /127\.0\.0\.1:54321|localhost:54321/;
const EMAIL = process.env.BENCH_EMAIL || "admin@gym.local";
const READY = process.env.BENCH_READY || "Pagos por Mes";
const YEAR = Number(process.env.BENCH_YEAR || new Date().getFullYear() - 1);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // phone-sized
const page = await context.newPage();

// Login without throttling
await page.goto(`${baseUrl}/login`);
await page.fill("#email", EMAIL);
await page.fill("#password", "Local1234!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 60000 });
await page.getByText(READY).first().waitFor({ timeout: 60000 }); // warm-up (also compiles in dev)

const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: LATENCY,
  downloadThroughput: (4 * 1024 * 1024) / 8, // 4 Mbps
  uploadThroughput: (1 * 1024 * 1024) / 8,
});

let requests = 0;
let bytes = 0;
page.on("requestfinished", async (req) => {
  if (!SUPABASE.test(req.url())) return;
  requests++;
  const sizes = await req.sizes().catch(() => null);
  if (sizes) bytes += sizes.responseBodySize + sizes.responseHeadersSize;
});

async function esperarListo() {
  await page.waitForFunction(
    (ready) => !document.body.innerText.includes("Cargando dashboard") && document.body.innerText.includes(ready),
    READY,
    { timeout: 60000, polling: 50 }
  );
}

const results = [];
for (let i = 0; i < RUNS; i++) {
  requests = 0;
  bytes = 0;
  const t0 = Date.now();
  await page.reload({ waitUntil: "commit" });
  await esperarListo();
  const ms = Date.now() - t0;
  await page.waitForLoadState("networkidle");
  results.push({ ms, requests, kb: Math.round(bytes / 1024) });
}

// eslint-disable-next-line security/detect-non-literal-fs-filename -- outDir is a CLI arg of a local dev script
mkdirSync(outDir, { recursive: true });
const text = await page.locator("main").innerText();
// eslint-disable-next-line security/detect-non-literal-fs-filename -- outDir is a CLI arg of a local dev script
writeFileSync(join(outDir, "dashboard-text.txt"), text);
await page.screenshot({ path: join(outDir, "dashboard.png"), fullPage: true });

// Year switch (browser-side load) and back
let yearSwitchMs = null;
const selector = page.locator('select[name="anio-seleccionado"]');
if (await selector.count()) {
  const actual = await selector.inputValue();
  const t0 = Date.now();
  await selector.selectOption(String(YEAR));
  await page.waitForTimeout(50);
  await esperarListo();
  await page.waitForLoadState("networkidle");
  yearSwitchMs = Date.now() - t0;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- outDir is a CLI arg of a local dev script
  writeFileSync(join(outDir, `dashboard-text-${YEAR}.txt`), await page.locator("main").innerText());
  await page.locator('select[name="anio-seleccionado"]').selectOption(actual);
  await page.waitForTimeout(50);
  await esperarListo();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(6000); // let the 5 s admin welcome banner hide in every version
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- outDir is a CLI arg of a local dev script
  writeFileSync(join(outDir, "dashboard-text-back.txt"), await page.locator("main").innerText());
}
await browser.close();

const sorted = [...results].map((r) => r.ms).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(JSON.stringify({ baseUrl, email: EMAIL, latencyMs: LATENCY, runs: results, medianMs: median, requests: results.at(-1).requests, kb: results.at(-1).kb, yearSwitchMs }, null, 2));
