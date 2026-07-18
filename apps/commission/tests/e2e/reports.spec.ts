import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M8.3/M8.4 — the Collection Reports UI, end to end (M8 §9 AC 1–8, AC10, AC12).
 * Provisions its OWN throwaway users, imports the REAL v30.20 workbook through the UI
 * (21 deals + 8 payments, all 2026), then drives the five deep-linkable report tabs:
 * cash per year, the vintage matrix + value toggle, monthly cash flow, tax per month
 * (with the BIR captions), and the booking-year summary (with the OQ4 Written-off
 * split) — plus the M8.4 CSV/XLSX exports (content + filename params tie to the screen)
 * and the Report 4 print layout under emulated print media (AC10 / FR-M8-11).
 *
 * CLOCK-ROBUST. The fixture is all 2026 and today (the CI clock) is 2026, so the
 * shared year selector's default (current Manila year) lands on the data without a
 * URL param. Skips cleanly when the real workbook is absent; deletes its users after.
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
  { auth: { persistSession: false } }
);

const PASSWORD = "throwaway-m83-pw";

async function makeUser(tag: string): Promise<{ uid: string; email: string }> {
  const email = `m83-${tag}-${Date.now()}@throwaway.test`;
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

test("/reports lands on the first tab (Cash per Year) — Report 1 (AC1)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/reports\/cash-per-year$/);
  await expect(page.getByTestId("report-tab-cash-per-year")).toHaveAttribute("aria-current", "page");

  // Row 2026 — the single non-zero paid year.
  const row = page.locator('[data-testid="cash-year-row"][data-year="2026"]');
  await expect(row.getByTestId("cash-net-of-vat")).toContainText("1,908,192.86");
  await expect(row).toContainText("1,909,085.71"); // Net Cash
  await expect(row).toContainText("5,357.14"); // Output VAT
  await expect(row).toContainText("4,464.29"); // EWT
  await expect(row).toContainText("8"); // # payments

  // TOTAL is identical (single year).
  await expect(page.getByTestId("cash-total-net-of-vat")).toContainText("1,908,192.86");
  await expect(page.getByTestId("cash-total-row")).toContainText("1,909,085.71");

  // Reports 1/2/5 have no year selector (shared control is reports 3 & 4 only).
  await expect(page.getByTestId("report-year-selector")).toHaveCount(0);
});

test("vintage matrix: diagonal cell, verbatim caption, value toggle (AC2/AC3)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/reports/vintage-matrix");

  // Verbatim reading-guide caption under the title.
  await expect(page.getByTestId("report-caption")).toHaveText(
    "Diagonal = collected in the year booked · below diagonal = pre-selling collection tail."
  );

  // The single populated cell (paid 2026, booked 2026) = 1,908,192.86 (Net of VAT default),
  // shaded as a diagonal cell; the row total equals the cell.
  const cell = page.locator('[data-testid="matrix-cell"][data-paid="2026"][data-booked="2026"]');
  await expect(cell).toContainText("1,908,192.86");
  await expect(cell).toHaveAttribute("data-rel", "diagonal");
  await expect(page.locator('[data-testid="matrix-row-total"][data-paid="2026"]')).toContainText(
    "1,908,192.86"
  );

  // The default toggle segment is Net of VAT.
  await expect(page.getByTestId("matrix-value-net_of_vat")).toHaveAttribute("data-active", "true");

  // Switch to Net Cash → the cell reads 1,909,085.71 and the URL carries ?value=net_cash.
  await page.getByTestId("matrix-value-net_cash").click();
  await expect(page).toHaveURL(/value=net_cash/);
  await expect(cell).toContainText("1,909,085.71");

  // Switching back returns to the clean default URL (Net of VAT is the default view).
  await page.getByTestId("matrix-value-net_of_vat").click();
  await expect(page).toHaveURL(/\/reports\/vintage-matrix$/);
  await expect(cell).toContainText("1,908,192.86");

  // The matrix scrolls inside its own container.
  await expect(page.getByTestId("matrix-scroll")).toBeVisible();
});

test("monthly cash flow: all 12 months, Jan & Jul, TOTAL (AC4)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/reports/monthly-cash-flow?year=2026");

  await expect(page.getByTestId("report-tab-monthly-cash-flow")).toHaveAttribute(
    "aria-current",
    "page"
  );
  // All twelve months render (rule 4).
  await expect(page.getByTestId("cashflow-row")).toHaveCount(12);

  const jan = page.locator('[data-testid="cashflow-row"][data-month="1"]');
  await expect(jan.getByTestId("cashflow-net-of-vat")).toContainText("436,050.00");
  await expect(jan.getByTestId("cashflow-net-cash")).toContainText("436,050.00");

  const jul = page.locator('[data-testid="cashflow-row"][data-month="7"]');
  await expect(jul.getByTestId("cashflow-net-of-vat")).toContainText("1,472,142.86");
  await expect(jul.getByTestId("cashflow-net-cash")).toContainText("1,473,035.71");

  // A zero month is present (not missing) — e.g. February.
  const feb = page.locator('[data-testid="cashflow-row"][data-month="2"]');
  await expect(feb.getByTestId("cashflow-net-of-vat")).toContainText("0.00");

  await expect(page.getByTestId("cashflow-total-net-of-vat")).toContainText("1,908,192.86");
  await expect(page.getByTestId("cashflow-total-net-cash")).toContainText("1,909,085.71");

  // The shared year selector is present with the rule-2 range (only 2026 here).
  await expect(page.getByTestId("report-year-selector")).toHaveValue("2026");
});

test("tax per month: Jul split, Jan base, TOTAL, verbatim BIR captions (AC5)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/reports/tax-per-month?year=2026");

  // Verbatim plain-language tax captions (FR-M8-07).
  await expect(page.getByTestId("tax-vat-header")).toContainText("Output VAT — to remit to BIR");
  await expect(page.getByTestId("tax-ewt-header")).toContainText(
    "EWT withheld — creditable, BIR Form 2307"
  );

  // July — D021's incentive release is the only taxable payment.
  const jul = page.locator('[data-testid="tax-row"][data-month="7"]');
  await expect(jul.getByTestId("tax-output-vat")).toContainText("5,357.14");
  await expect(jul.getByTestId("tax-ewt")).toContainText("4,464.29");
  await expect(jul.getByTestId("tax-base")).toContainText("1,472,142.86");
  await expect(jul.getByTestId("tax-payments")).toHaveText("7");

  // January — untaxed resale collection, base still reported.
  const jan = page.locator('[data-testid="tax-row"][data-month="1"]');
  await expect(jan.getByTestId("tax-output-vat")).toContainText("0.00");
  await expect(jan.getByTestId("tax-ewt")).toContainText("0.00");
  await expect(jan.getByTestId("tax-base")).toContainText("436,050.00");
  await expect(jan.getByTestId("tax-payments")).toHaveText("1");

  // TOTAL.
  await expect(page.getByTestId("tax-total-output-vat")).toContainText("5,357.14");
  await expect(page.getByTestId("tax-total-ewt")).toContainText("4,464.29");
  await expect(page.getByTestId("tax-total-base")).toContainText("1,908,192.86");
  await expect(page.getByTestId("tax-total-payments")).toHaveText("8");
});

test("booking-year summary: row 2026, Written-off split marked as departure (AC6)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/reports/booking-year-summary");

  const row = page.locator('[data-testid="booking-row"][data-year="2026"]');
  await expect(row.getByTestId("booking-deals")).toHaveText("21");
  await expect(row.getByTestId("booking-gci")).toContainText("6,688,497.25");
  await expect(row.getByTestId("booking-collected")).toContainText("1,908,192.86");
  await expect(row.getByTestId("booking-outstanding")).toContainText("4,855,304.39");
  // OQ4 split: the fixture has no cancelled deals → Written-off 0.00 (Outstanding holds
  // the workbook number).
  await expect(row.getByTestId("booking-written-off")).toContainText("0.00");

  // The Written-off column is marked as a deliberate sheet departure.
  await expect(page.getByTestId("written-off-departure")).toBeVisible();
  await expect(page.getByTestId("written-off-note")).toContainText("departure");

  await expect(page.getByTestId("booking-total-collected")).toContainText("1,908,192.86");
});

test("export: Report 1 CSV ties to the on-screen rows incl. TOTAL, dated filename (AC10)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  const res = await page.request.get("/api/export/cash-per-year?format=csv");
  expect(res.status()).toBe(200);
  // Filename stem is the report; the route dates it (zeta-cash-per-year-YYYY-MM-DD.csv).
  expect(res.headers()["content-disposition"]).toMatch(/filename="zeta-cash-per-year-\d{4}-\d{2}-\d{2}\.csv"/);
  const csv = await res.text();
  // Exact stored strings — no thousands separators, no ₱ (the archival copy).
  expect(csv).toContain("Year,Net of VAT,Net Cash,Output VAT,EWT,# Payments");
  expect(csv).toContain("2026,1908192.86,1909085.71,5357.14,4464.29,8");
  expect(csv).toContain("TOTAL,1908192.86,1909085.71,5357.14,4464.29,8");
});

test("export: vintage matrix CSV carries both toggle values + labels the file (AC3/AC10)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // Net of VAT (default) — the single cell + row/column totals carry 1,908,192.86.
  const nov = await page.request.get("/api/export/vintage-matrix?format=csv");
  expect(nov.headers()["content-disposition"]).toMatch(/filename="zeta-vintage-matrix-net_of_vat-/);
  const novCsv = await nov.text();
  expect(novCsv).toContain("Year Paid,2026,Row total");
  expect(novCsv).toContain("2026,1908192.86,1908192.86");
  expect(novCsv).toContain("TOTAL,1908192.86,1908192.86");

  // Net Cash toggle — the filename reflects it and the cash figure changes.
  const nc = await page.request.get("/api/export/vintage-matrix?format=csv&value=net_cash");
  expect(nc.headers()["content-disposition"]).toMatch(/filename="zeta-vintage-matrix-net_cash-/);
  const ncCsv = await nc.text();
  expect(ncCsv).toContain("2026,1909085.71,1909085.71");
});

test("export: Report 4 CSV carries the verbatim BIR caption headers + year in filename (AC5/AC10)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  const res = await page.request.get("/api/export/tax-per-month?format=csv&year=2026");
  expect(res.headers()["content-disposition"]).toMatch(/filename="zeta-tax-per-month-2026-/);
  const csv = await res.text();
  // The plain-language captions the accountant reads, verbatim (FR-M8-07).
  expect(csv).toContain("Output VAT — to remit to BIR");
  expect(csv).toContain("EWT withheld — creditable, BIR Form 2307");
  // July split + the TOTAL, exact strings.
  expect(csv).toContain("July,5357.14,4464.29,1472142.86,7");
  expect(csv).toContain("TOTAL,5357.14,4464.29,1908192.86,8");
});

test("export: Report 5 CSV splits the Written-off column; XLSX downloads as a workbook (AC10)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  const csvRes = await page.request.get("/api/export/booking-year-summary?format=csv");
  const csv = await csvRes.text();
  expect(csv).toContain("Booking year,Deals,GCI (Net of VAT),Collected,Outstanding,Written off");
  // Fixture has no cancelled deals → Written-off 0.00, Outstanding holds the workbook number.
  expect(csv).toContain("2026,21,6688497.25,1908192.86,4855304.39,0.00");

  // XLSX comes back as a real spreadsheet (binary), not an error page.
  const xlsxRes = await page.request.get("/api/export/tax-per-month?format=xlsx&year=2026");
  expect(xlsxRes.status()).toBe(200);
  expect(xlsxRes.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  expect(xlsxRes.headers()["content-disposition"]).toMatch(/filename="zeta-tax-per-month-2026-.*\.xlsx"/);
  expect((await xlsxRes.body()).length).toBeGreaterThan(0);
});

test("Report 4 print layout: header block shows under print media, chrome is hidden (FR-M8-11)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/reports/tax-per-month?year=2026");

  // The Print button is present on Report 4 (the accountant hand-off tab).
  await expect(page.getByTestId("report-print")).toBeVisible();

  // Emulate the print stylesheet: the header block (workspace · report · year ·
  // generated-on) appears, the app chrome / tabs / export buttons drop out, and the
  // twelve-month table stays.
  await page.emulateMedia({ media: "print" });
  const header = page.getByTestId("report-print-header");
  await expect(header).toBeVisible();
  await expect(header).toContainText("Tax Collected per Month — 2026");
  await expect(header).toContainText("Generated");
  await expect(page.getByTestId("reports-tabs")).toBeHidden(); // no-print chrome
  await expect(page.getByTestId("report-print")).toBeHidden(); // the button itself
  await expect(page.locator('[data-testid="tax-row"]')).toHaveCount(12); // table survives
  await page.emulateMedia({ media: "screen" });
});

test("deep links + shared year: tabs 3 & 4 carry the year, others don't", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // A deep link lands on the right tab with its state.
  await page.goto("/reports/tax-per-month?year=2026");
  await expect(page.getByTestId("report-tab-tax-per-month")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("report-year-selector")).toHaveValue("2026");

  // The Monthly Cash Flow tab link carries the year (shared control, reports 3 & 4).
  await page.getByTestId("report-tab-monthly-cash-flow").click();
  await expect(page).toHaveURL(/\/reports\/monthly-cash-flow\?year=2026/);
  await expect(page.getByTestId("report-year-selector")).toHaveValue("2026");

  // The Cash per Year tab (all-time) links clean — no year carried over.
  await page.getByTestId("report-tab-cash-per-year").click();
  await expect(page).toHaveURL(/\/reports\/cash-per-year$/);
});

test("GET-only: a write verb against an M8 route is 405 (AC12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  const res = await page.request.post("/api/reports/cash-per-year");
  expect(res.status()).toBe(405);
});

test("empty workspace shows the reports empty state (rule 14)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, emptyEmail);

  await page.goto("/reports/cash-per-year");
  await expect(page.getByText("No payments logged yet")).toBeVisible();

  // Report 5 is deal-driven → its empty state points at the Deal Log.
  await page.goto("/reports/booking-year-summary");
  await expect(page.getByText("No deals logged yet")).toBeVisible();
});

test("360px: cards render, matrix scrolls in-container, no body overflow, console clean", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, email);

  // Report 1 collapses to stacked cards.
  await page.goto("/reports/cash-per-year");
  await expect(page.getByTestId("cash-cards")).toBeVisible();
  await expect(page.getByTestId("cash-total-card")).toContainText("1,908,192.86");
  await expectNoBodyOverflow(page);

  // The matrix stays a horizontally-scrollable table (never a card layout).
  await page.goto("/reports/vintage-matrix");
  await expect(page.getByTestId("matrix-scroll")).toBeVisible();
  await expectNoBodyOverflow(page);

  // Tax per month cards.
  await page.goto("/reports/tax-per-month?year=2026");
  await expect(page.getByTestId("tax-cards")).toBeVisible();
  await expectNoBodyOverflow(page);

  const real = errors.filter((e) => !/Download the React DevTools|hydrat/i.test(e));
  expect(real).toEqual([]);
});

async function expectNoBodyOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
}
