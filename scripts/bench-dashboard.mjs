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
 * of the app can be diffed for identical output.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [baseUrl = "http://localhost:3000", runsArg = "7", latencyArg = "150", outDir = "bench-out"] = process.argv.slice(2);
const RUNS = Number(runsArg);
const LATENCY = Number(latencyArg);
const SUPABASE = /127\.0\.0\.1:54321|localhost:54321/;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // phone-sized
const page = await context.newPage();

// Login without throttling
await page.goto(`${baseUrl}/login`);
await page.fill("#email", "admin@gym.local");
await page.fill("#password", "Local1234!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 60000 });
await page.getByText("Pagos por Mes").first().waitFor({ timeout: 60000 }); // warm-up (also compiles in dev)

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

const results = [];
for (let i = 0; i < RUNS; i++) {
  requests = 0;
  bytes = 0;
  const t0 = Date.now();
  await page.reload({ waitUntil: "commit" });
  await page.waitForFunction(
    () => !document.body.innerText.includes("Cargando dashboard") && document.body.innerText.includes("Pagos por Mes"),
    null,
    { timeout: 60000, polling: 50 }
  );
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
await browser.close();

const sorted = [...results].map((r) => r.ms).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(JSON.stringify({ baseUrl, latencyMs: LATENCY, runs: results, medianMs: median, requests: results.at(-1).requests, kb: results.at(-1).kb }, null, 2));
