import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M2.4 — the Yield Summary screen, end to end (M2 §9 AC 1–3, 5, 12–13 + drill-through).
 * Provisions its OWN throwaway users (fresh signup-bootstrapped workspaces), imports
 * the REAL v30.20 workbook through the UI so the 21 deals exist and the yield consumer
 * drains, then drives /yield-summary.
 *
 * CLOCK-ROBUST. M2 is a booked-basis read model with no clock. The 21 fixtures are all
 * booked 2026, so `?year=all` shows the full data regardless of the machine's current
 * year — the value assertions use it, and the default-year behaviour is exercised
 * separately. Skips cleanly when the real workbook is absent; deletes its users after.
 */

test.describe.configure({ mode: "serial" });

const REAL_WORKBOOK = path.resolve(
  __dirname,
  "../../discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx"
);
const HAVE_WORKBOOK = existsSync(REAL_WORKBOOK);

function env(): Record<string, string> {
  const raw = readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8");
  const e: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return e;
}

const E = env();
const admin: SupabaseClient = createClient(
  E.NEXT_PUBLIC_SUPABASE_URL,
  E.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "commission" }, auth: { persistSession: false } }
);

const PASSWORD = "throwaway-m24-pw";

async function makeUser(tag: string): Promise<{ uid: string; email: string }> {
  const email = `m24-${tag}-${Date.now()}@throwaway.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { uid: data.user!.id, email };
}

const users: string[] = [];
let email = "";
let emptyEmail = "";

test.beforeAll(async () => {
  if (!HAVE_WORKBOOK) return;
  const main = await makeUser("data");
  const empty = await makeUser("empty");
  users.push(main.uid, empty.uid);
  email = main.email;
  emptyEmail = empty.email;
});

test.afterAll(async () => {
  for (const uid of users) await admin.auth.admin.deleteUser(uid);
});

async function signIn(page: Page, who: string) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(who);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("import the real v30.20 workbook", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present in discovery/source");
  await signIn(page, email);
  await page.goto("/deals/import");
  await page.getByTestId("import-file").setInputFiles(REAL_WORKBOOK);
  await page.getByTestId("import-dry-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-done")).toContainText("21 deals");
});

test("segment table reproduces the §9 fixtures (AC1)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/yield-summary?year=all");

  const cell = (row: string, col: string) => page.getByTestId(`${row}-${col}`);

  // Resale 7 / ₱55,251,000.00 / ₱2,687,550.00 / 4.8643% / 34.69%
  await expect(cell("resale", "deals")).toHaveText("7");
  await expect(cell("resale", "volume")).toContainText("55,251,000.00");
  await expect(cell("resale", "gci")).toContainText("2,687,550.00");
  await expect(cell("resale", "yield")).toContainText("4.8643%");
  await expect(cell("resale", "share")).toContainText("34.69%");

  // Developer 10 / ₱104,029,945.00 / ₱3,800,947.25 / 3.6537% / 65.31%
  await expect(cell("developer", "deals")).toHaveText("10");
  await expect(cell("developer", "volume")).toContainText("104,029,945.00");
  await expect(cell("developer", "gci")).toContainText("3,800,947.25");
  await expect(cell("developer", "yield")).toContainText("3.6537%");
  await expect(cell("developer", "share")).toContainText("65.31%");

  // SALES SUBTOTAL 17 / ₱159,280,945.00 / ₱6,488,497.25 / 4.0736% / 100.00%
  await expect(cell("sales_subtotal", "deals")).toHaveText("17");
  await expect(cell("sales_subtotal", "volume")).toContainText("159,280,945.00");
  await expect(cell("sales_subtotal", "gci")).toContainText("6,488,497.25");
  await expect(cell("sales_subtotal", "yield")).toContainText("4.0736%");
  await expect(cell("sales_subtotal", "share")).toContainText("100.00%");

  // Rental 4 / ₱2,400,000.00 / ₱200,000.00 / 8.3333% / — (never in the sales mix)
  await expect(cell("rental", "deals")).toHaveText("4");
  await expect(cell("rental", "volume")).toContainText("2,400,000.00");
  await expect(cell("rental", "gci")).toContainText("200,000.00");
  await expect(cell("rental", "yield")).toContainText("8.3333%");
  await expect(cell("rental", "share")).toContainText("—");

  // Referral empty: 0 / ₱0.00 / ₱0.00 / — / —
  await expect(cell("referral", "deals")).toHaveText("0");
  await expect(cell("referral", "yield")).toContainText("—");
  await expect(cell("referral", "share")).toContainText("—");
});

test("TOTAL GCI + memos + averages (AC2/AC3)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/yield-summary?year=all");

  await expect(page.getByTestId("total-gci")).toContainText("6,688,497.25");
  await expect(page.getByTestId("memo-incentives")).toContainText("357,142.87");
  // Referral-outs shown as a negative in parentheses.
  await expect(page.getByTestId("memo-referral-outs")).toContainText("75,000.00");
  await expect(page.getByTestId("memo-referral-outs")).toContainText("(");

  await expect(page.getByTestId("avg-resale-value")).toContainText("7,893,000.00");
  await expect(page.getByTestId("avg-developer-value")).toContainText("10,402,994.50");
  await expect(page.getByTestId("avg-blended-value")).toContainText("9,369,467.35");
  await expect(page.getByTestId("rental-annual-gci-value")).toContainText("200,000.00");
});

test("Planning Basis card — 4.0736% / ₱9,369,467.35, links to the calculator (AC4)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/yield-summary?year=all");

  await expect(page.getByTestId("planning-yield")).toContainText("4.0736%");
  await expect(page.getByTestId("planning-price")).toContainText("9,369,467.35");
  await expect(page.getByTestId("planning-basis-card")).toContainText("ignores the report-year filter");
  await expect(page.getByTestId("planning-yield-link")).toHaveAttribute("href", "/calculator");
});

test("year filter scopes the table only; the planning basis never moves (AC5)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // 2026 ≡ All for this data — byte-identical subtotal.
  await page.goto("/yield-summary?year=2026");
  await expect(page.getByTestId("sales_subtotal-deals")).toHaveText("17");
  await page.goto("/yield-summary?year=all");
  await expect(page.getByTestId("sales_subtotal-deals")).toHaveText("17");

  // 2027: zeros + the "basis unaffected" hint, and the planning basis is unmoved.
  await page.goto("/yield-summary?year=2027");
  await expect(page.getByTestId("sales_subtotal-deals")).toHaveText("0");
  await expect(page.getByTestId("sales_subtotal-gci")).toContainText("0.00");
  await expect(page.getByTestId("empty-year-hint")).toBeVisible();
  await expect(page.getByTestId("planning-yield")).toContainText("4.0736%");
  await expect(page.getByTestId("planning-price")).toContainText("9,369,467.35");

  // The blue select control drives the URL (from All → 2026, the default → clean URL).
  await page.goto("/yield-summary?year=all");
  await page.getByTestId("yield-year-filter").selectOption("2026");
  await expect(page).toHaveURL(/\/yield-summary$/);
  await expect(page.getByTestId("sales_subtotal-deals")).toHaveText("17");
});

test("segment drill-through lands on exactly the segment's deals (AC12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/yield-summary?year=all");

  // The drill link renders in both the desktop table and the mobile cards; click the
  // table's (visible at the default viewport).
  const table = page.getByTestId("segment-table");
  await table.getByTestId("segment-drill-resale").click();
  await expect(page).toHaveURL(/\/deals\?segment=resale/);
  await expect(page.getByTestId("result-count")).toContainText("7 deals");
  await expect(page.getByTestId("segment-filter-chip")).toContainText("Resale");

  // Developer row → 10 deals.
  await page.goto("/yield-summary?year=all");
  await page.getByTestId("segment-table").getByTestId("segment-drill-developer").click();
  await expect(page.getByTestId("result-count")).toContainText("10 deals");
});

test("CSV/XLSX export matches the screen with yields at 4 dp (AC12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/yield-summary?year=all");

  // CSV over the same auth context — money exact, yields at 4 dp, planning basis block.
  const csv = await page.request.get("/api/export/yield-summary?format=csv&year=all");
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Realized Yield");
  expect(text).toContain("4.8643%"); // resale yield at 4 dp
  expect(text).toContain("4.0736%"); // subtotal + planning yield at 4 dp
  expect(text).toContain("6488497.25"); // subtotal GCI, exact stored string
  expect(text).toContain("9369467.35"); // planning price, display-rounded
  expect(text).toContain("PLANNING BASIS");

  // XLSX downloads with the spreadsheet content type.
  const xlsx = await page.request.get("/api/export/yield-summary?format=xlsx&year=all");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("360px: per-segment cards, planning card pinned first, console clean", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, email);
  await page.goto("/yield-summary?year=all");

  await expect(page.getByTestId("segment-cards")).toBeVisible();
  await expect(page.getByTestId("segment-card-sales_subtotal")).toContainText("159,280,945.00");
  await expect(page.getByTestId("planning-basis-card")).toBeVisible();

  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(noOverflow).toBe(true);
  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});

test("a brand-new workspace shows the global empty state (AC11)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, emptyEmail);
  await page.goto("/yield-summary");

  await expect(page.getByText("No deals yet")).toBeVisible();
  await expect(page.getByTestId("segment-table")).toHaveCount(0);
  await expect(page.getByTestId("planning-basis-card")).toHaveCount(0);
});
