// DESIGN PASS screenshot sweep (not shipped). Logs into the USER-OWNED dev
// server on :3000 with the throwaway workspace, screenshots every major surface
// at desktop + 360px. Never starts/kills a server.
//
//   node scripts/design-shots.mjs desktop
//   node scripts/design-shots.mjs mobile
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const CRED = "/private/tmp/claude-501/-Users-juliusbaliling-Projects-nurture-your-commission/52df508a-bedb-4353-8acf-d26690529daf/scratchpad/design-shot-cred.json";
const OUT = "/private/tmp/claude-501/-Users-juliusbaliling-Projects-nurture-your-commission/52df508a-bedb-4353-8acf-d26690529daf/scratchpad/shots";
const BASE = "http://localhost:3000";
const mode = process.argv[2] === "mobile" ? "mobile" : "desktop";
const viewport = mode === "mobile" ? { width: 360, height: 780 } : { width: 1320, height: 900 };

const { email, password } = JSON.parse(readFileSync(CRED, "utf8"));
mkdirSync(OUT, { recursive: true });

// [slug, path, optional prep]
const ROUTES = [
  ["dashboard", "/dashboard"],
  ["deals", "/deals"],
  ["deal-detail", "/deals/D001"],
  ["deal-new", "/deals/new"],
  ["payments", "/payments"],
  ["payment-new", "/payments/new"],
  ["collectibles", "/collectibles"],
  ["collectible-detail", "/collectibles/D001"],
  ["yield-summary", "/yield-summary"],
  ["calculator", "/calculator"],
  ["source-performance", "/source-performance"],
  ["reports", "/reports"],
  ["report-monthly", "/reports/monthly-cash-flow"],
  ["search", "/search?q=D001"],
  ["glossary", "/glossary"],
  ["settings-general", "/settings/general"],
  ["settings-tax", "/settings/tax"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Pre-auth surfaces first (only once, on desktop pass and mobile pass both).
for (const [slug, path] of [["login", "/login"], ["register", "/register"]]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${mode}-${slug}.png` });
  console.log(`shot ${mode}-${slug}`);
}

// Log in.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('[data-testid="email-input"]', email);
await page.fill('[data-testid="password-input"]', password);
await Promise.all([
  page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 30000 }).catch(() => {}),
  page.click('[data-testid="sign-in-button"]'),
]);
await page.waitForTimeout(800);

for (const [slug, path] of ROUTES) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${mode}-${slug}.png`, fullPage: false });
    console.log(`shot ${mode}-${slug}`);
  } catch (e) {
    console.log(`SKIP ${slug}: ${e.message.split("\n")[0]}`);
  }
}

await browser.close();
console.log(`\n${mode} sweep done → ${OUT}`);
