import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M3.3/M3.4 — the GCI Calculator (planning screen + live pace), end to end (M3 §9
 * AC 1, 2, 3, 4, 6, 7, 8, 10 + export + 360px). Provisions its OWN throwaway users,
 * imports the REAL v30.20 workbook so 2026 is plannable over the live basis, then drives
 * /calculator: every §10 figure, the live Rule P12 pace (YTD ₱161,680,945 / balance
 * ₱253,674,642.83), a new deal moving YTD then archiving it back (FR-M3-13), instant
 * funnel recalc + gated save, add-a-year, the opex+cos validation, a per-year override +
 * revert, the empty state, and the plan export.
 *
 * CLOCK-ROBUST value assertions use ?year=2026 (the workbook's plan year); mutating tests
 * revert so later tests read the pristine 2026 plan. Skips cleanly when the workbook is
 * absent; deletes its users after (delta-residue zero).
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

const PASSWORD = "throwaway-m33-pw";

async function makeUser(tag: string): Promise<{ uid: string; email: string }> {
  const email = `m33-${tag}-${Date.now()}@throwaway.test`;
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

/** Navigate, retrying the dev-server cold-compile ERR_ABORTED ("frame detached") that a
 * first hit on an uncompiled route throws under load (documented in progress.txt since M5.4). */
async function gotoResilient(page: Page, url: string) {
  for (let i = 0; i < 3; i += 1) {
    try {
      await page.goto(url);
      return;
    } catch (e) {
      if (i === 2 || !/ERR_ABORTED|frame was detached/.test(String(e))) throw e;
    }
  }
}

async function signIn(page: Page, who: string) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(who);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Drive a mode-'checked' ConfirmGate to completion. Waits for the dialog to close on
 * success (the action resolved + the page revalidated) before returning, so a follow-up
 * reload never races the in-flight server action. */
async function confirmGate(page: Page, gateTestId: string) {
  await expect(page.getByTestId(gateTestId)).toBeVisible();
  await page.getByTestId(`${gateTestId}-checkbox`).click();
  await page.getByTestId(`${gateTestId}-confirm`).click();
  await expect(page.getByTestId(gateTestId)).toBeHidden();
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

test("2026 reproduces every §10 value (AC1/AC2)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/calculator?year=2026");

  // economic model
  await expect(page.getByTestId("economic-net-income-pct")).toContainText("68.00%");
  await expect(page.getByTestId("economic-opex-value")).toContainText("22.00%");
  await expect(page.getByTestId("economic-cos-value")).toContainText("10.00%");
  await expect(page.getByTestId("economic-raw-target")).toContainText("16,911,764.71");
  await expect(page.getByTestId("economic-working-goal")).toContainText("16,920,000.00");

  // assumptions
  await expect(page.getByTestId("assumption-price-value")).toContainText("9,369,467.35");
  await expect(page.getByTestId("assumption-yield-value")).toContainText("4.0736%");
  await expect(page.getByTestId("assumption-fees")).toContainText("381,676.31");
  await expect(page.getByTestId("assumption-price-source")).toContainText("All-time realized");
  await expect(page.getByTestId("assumption-yield-source")).toContainText("All-time realized");

  // goals table
  await expect(page.getByTestId("goal-gci-yearly")).toContainText("16,920,000.00");
  await expect(page.getByTestId("goal-gci-monthly")).toContainText("1,410,000.00");
  await expect(page.getByTestId("goal-gci-weekly")).toContainText("352,500.00");
  await expect(page.getByTestId("goal-listings-sold-yearly")).toHaveText("44.33");
  await expect(page.getByTestId("goal-buyer-atp-yearly")).toHaveText("44.33");

  // seller funnel 44.33 / 177.32 / 253.32 / 844.40 / 4,221.98
  await expect(page.getByTestId("funnel-listings_sold-yearly")).toHaveText("44.33");
  await expect(page.getByTestId("funnel-listings_to_take-yearly")).toHaveText("177.32");
  await expect(page.getByTestId("funnel-listing_appointments-yearly")).toHaveText("253.32");
  await expect(page.getByTestId("funnel-seller_contacts-yearly")).toHaveText("844.40");
  await expect(page.getByTestId("funnel-seller_leads-yearly")).toHaveText("4,221.98");

  // buyer funnel 44.33 / 147.77 / 211.10 / 2,110.99
  await expect(page.getByTestId("funnel-buyer_atp-yearly")).toHaveText("44.33");
  await expect(page.getByTestId("funnel-viewings-yearly")).toHaveText("147.77");
  await expect(page.getByTestId("funnel-buyer_contacts-yearly")).toHaveText("211.10");
  await expect(page.getByTestId("funnel-buyer_leads-yearly")).toHaveText("2,110.99");

  // pace (M3.4, Rules P11–P13): Total Sales required, live YTD actual, and Balance —
  // 17 sales ₱159,280,945 + 4 rentals ₱2,400,000 = ₱161,680,945; balance behind-coloured.
  await expect(page.getByTestId("pace-total-value")).toContainText("415,355,587.83");
  await expect(page.getByTestId("pace-ytd-value")).toContainText("161,680,945.00");
  await expect(page.getByTestId("pace-balance-value")).toContainText("253,674,642.83");
  await expect(page.getByTestId("pace-balance")).toContainText("Still to transact");
});

test("editing a funnel rate recomputes instantly and persists on confirm (AC6/AC7)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/calculator?year=2026");
  // Wait for the client to hydrate — a rate typed before hydration never fires the recompute.
  await expect(page.getByTestId("planning-screen")).toHaveAttribute("data-hydrated", "true");

  // Listing-to-Sold 25% → 30% recomputes Listings to take = 44.33 ÷ 0.30 = 147.77 LIVE.
  await page.getByTestId("rate-listingToSold").fill("30");
  await expect(page.getByTestId("funnel-listings_to_take-yearly")).toHaveText("147.77");

  // Save behind the gate, then reload → the new rate persisted.
  await page.getByTestId("rates-save").click();
  await confirmGate(page, "rates-save-gate");
  await page.goto("/calculator?year=2026");
  await expect(page.getByTestId("rate-listingToSold")).toHaveValue("30");
  await expect(page.getByTestId("funnel-listings_to_take-yearly")).toHaveText("147.77");

  // Restore to 25% so global rates stay pristine for later reads.
  await expect(page.getByTestId("planning-screen")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("rate-listingToSold").fill("25");
  await page.getByTestId("rates-save").click();
  await confirmGate(page, "rates-save-gate");
  await page.goto("/calculator?year=2026");
  await expect(page.getByTestId("funnel-listings_to_take-yearly")).toHaveText("177.32");
});

test("a not-plannable year shows the empty state; setting a NIT unblocks it (AC-rule 9)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/calculator?year=2027");
  await expect(page.getByTestId("plan-empty-nit")).toBeVisible();

  await page.getByTestId("empty-nit-edit-open").click();
  await page.getByTestId("empty-nit-edit-nit").fill("11500000");
  await confirmGate(page, "empty-nit-edit");

  // Same basis → 2027 derives the same working goal, and the plan renders.
  await expect(page.getByTestId("economic-working-goal")).toContainText("16,920,000.00");
});

test("opex 60% + cos 40% is refused inline and nothing persists (AC5)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/calculator?year=2026");

  // Try to add a 2099 row whose costs total 100%.
  await page.getByTestId("targets-add").click();
  await expect(page.getByTestId("targets-add-gate")).toBeVisible();
  await page.getByTestId("targets-add-gate-year").fill("2099");
  await page.getByTestId("targets-add-gate-nit").fill("5000000");
  await page.getByTestId("targets-add-gate-opex").fill("60");
  await page.getByTestId("targets-add-gate-cos").fill("40");
  await page.getByTestId("targets-add-gate-checkbox").click();
  await page.getByTestId("targets-add-gate-confirm").click();

  await expect(page.getByTestId("targets-add-gate-error")).toContainText(
    "Opex % + Cost of Sales % must total less than 100%"
  );
  await page.getByTestId("targets-add-gate-cancel").click();
  // 2099 never persisted.
  await expect(page.getByTestId("targets-row-2099")).toHaveCount(0);
});

test("a per-year override flips the source label and reverts to all-time (AC-rule 3)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/calculator?year=2026");

  // Set a 5% yield override for 2026.
  await page.getByTestId("assumption-edit").click();
  await page.getByTestId("assumption-edit-gate-yield").fill("5");
  await confirmGate(page, "assumption-edit-gate");

  await expect(page.getByTestId("assumption-yield-source")).toContainText("Override for 2026");
  await expect(page.getByTestId("assumption-yield-value")).toContainText("5.0000%");

  // One-click revert → back to the all-time basis.
  await page.getByTestId("assumption-yield-revert").click();
  await confirmGate(page, "assumption-yield-revert-gate");
  await expect(page.getByTestId("assumption-yield-source")).toContainText("All-time realized");
  await expect(page.getByTestId("assumption-yield-value")).toContainText("4.0736%");
});

test("the plan exports to CSV/XLSX matching the screen (FR-M3-12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  const csv = await page.request.get("/api/export/calculator-plan?format=csv&year=2026");
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Working GCI goal");
  expect(text).toContain("16920000.00"); // exact stored working goal
  expect(text).toContain("381676.31"); // fees per deal
  expect(text).toContain("415355587.83"); // total sales required
  expect(text).toContain("161680945.00"); // live YTD actual booked (Rule P12)
  expect(text).toContain("253674642.83"); // balance to target (Rule P13)

  const xlsx = await page.request.get("/api/export/calculator-plan?format=xlsx&year=2026");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("AC10/FR-M3-13: a new 2026 Sale moves YTD live; archiving restores it", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // baseline pace
  await page.goto("/calculator?year=2026");
  await expect(page.getByTestId("pace-ytd-value")).toContainText("161,680,945.00");

  // log a ₱10,000,000 2026 resale sale through the real deal form
  await page.goto("/deals/new");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("field-dealType").selectOption("resale");
  await page.getByTestId("field-bookedDate").fill("2026-05-05");
  await page.getByTestId("field-clientName").fill("M34 Pace Test");
  await page.getByTestId("field-representation").selectOption("buyer");
  await page.getByTestId("field-propertyTypeId").selectOption({ index: 1 });
  await page.getByTestId("field-leadSourceId").selectOption({ index: 1 });
  await page.getByTestId("field-propertyDetails").fill("M34 synthetic sale");
  await page.getByTestId("field-modeOfPayment").selectOption("cash");
  await page.getByTestId("field-listPrice").fill("10000000");
  await page.getByTestId("field-rate").fill("5");
  await page.getByTestId("deal-submit").click();
  // A one-sided (buyer) resale can raise a soft split warning that turns the button into
  // "Save anyway" — tolerate it so the create is deterministic under load.
  const submit = page.getByTestId("deal-submit");
  if (await submit.getByText(/Save anyway/i).isVisible().catch(() => false)) await submit.click();
  await expect(page).toHaveURL(/\/deals$/);

  // YTD rises by exactly ₱10,000,000 (Σ list_price is basis-independent, live off the deal table)
  await page.goto("/calculator?year=2026");
  await expect(page.getByTestId("pace-ytd-value")).toContainText("171,680,945.00");

  // archive the new deal from its detail page. The import created exactly 21 deals
  // (D001–D021) and no test creates another before this, so the new deal is D022.
  await gotoResilient(page, "/deals/D022");
  await expect(page.getByTestId("detail-net-gci")).toBeVisible();
  await page.getByTestId("archive-deal").click();
  await expect(page.getByTestId("restore-deal")).toBeVisible();

  // archived deals are EXCLUDED → pace is pristine again (YTD + balance to the centavo)
  await page.goto("/calculator?year=2026");
  await expect(page.getByTestId("pace-ytd-value")).toContainText("161,680,945.00");
  await expect(page.getByTestId("pace-balance-value")).toContainText("253,674,642.83");
});

test("a brand-new workspace shows the guided empty state (FR-M3-09)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, emptyEmail);
  await page.goto("/calculator");
  await expect(page.getByTestId("plan-empty-nit")).toBeVisible();
});

test("360px: the plan renders, no horizontal overflow, console clean", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, email);
  await page.goto("/calculator?year=2026");

  await expect(page.getByTestId("section-economic")).toBeVisible();
  await expect(page.getByTestId("economic-working-goal")).toContainText("16,920,000.00");
  await expect(page.getByTestId("funnel-seller_leads-yearly")).toHaveText("4,221.98");

  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(noOverflow).toBe(true);
  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});
