import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M6.2 — the Collections Dashboard's top half (Sections 1 Position, 2 Collected vs
 * Target, 3 Cash & Tax, 6 Monthly Cash-In), end to end (M6 §9 AC 1–4, 7, 13 +
 * drill-downs + empty state). Provisions its OWN throwaway user (a fresh empty
 * workspace, signup-bootstrapped), imports the REAL v30.20 workbook through the UI
 * so the 21 receivables + 8 payments exist, then drives /dashboard.
 *
 * CLOCK. The dashboard reads the LIVE Asia/Manila clock (no injectable `today` on
 * the page, by design). So this spec asserts the clock-INDEPENDENT facts to the
 * centavo (Sections 1/3, collected-for-year, monthly collected/cumulative) and the
 * pace DIRECTION (behind/ahead) rather than the day-dependent peso — the frozen
 * pace numbers live in the unit + live-check suites.
 *
 * TARGET. M3's TargetTable lands AFTER M6, so getTargetTableRow returns null: with
 * no override Section 2 shows "—" (rule 9, not an error). The override flow is what
 * lights up the target, pace bar and monthly cumulative target — exactly as specced.
 *
 * Skips cleanly when the real workbook is absent (referenced from discovery/source
 * at runtime, never committed into tests/). Deletes its users afterwards.
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

const PASSWORD = "throwaway-m62-pw";

/** A fresh throwaway agent + their bootstrapped workspace. */
async function makeUser(tag: string): Promise<{ uid: string; email: string }> {
  const email = `m62-${tag}-${Date.now()}@throwaway.test`;
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

test("Section 1 — Collection Position tiles (AC1)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  await expect(page.getByTestId("tile-total-collectible-value")).toHaveText("₱ 6,763,497.25");
  await expect(page.getByTestId("tile-total-collected-value")).toHaveText("₱ 1,908,192.86");
  await expect(page.getByTestId("tile-balance-outstanding-value")).toHaveText("₱ 4,855,304.39");
  await expect(page.getByTestId("tile-pct-collected-value")).toHaveText("28.21%");
  await expect(page.getByTestId("tile-written-off-value")).toHaveText("₱ 0.00");
  await expect(page.getByTestId("tile-variance-value")).toHaveText("₱ 0.00");
  await expect(page.getByTestId("tile-net-cash-value")).toHaveText("₱ 1,909,085.71");
  await expect(page.getByTestId("tile-referral-owed-value")).toHaveText("₱ 0.00");
  await expect(page.getByTestId("tile-referral-owed")).toContainText("across 0 deals");
});

test("Section 3 — Cash & Tax waterfall + verbatim explainer (AC4)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  await expect(page.getByTestId("cash-tax-gross")).toContainText("1,913,550.00");
  await expect(page.getByTestId("cash-tax-vat")).toContainText("5,357.14");
  await expect(page.getByTestId("cash-tax-ewt")).toContainText("4,464.29");
  await expect(page.getByTestId("cash-tax-net-cash")).toContainText("1,909,085.71");
  await expect(page.getByTestId("cash-tax-retained")).toContainText("1,903,728.57");
  await expect(page.getByTestId("cash-tax-explainer")).toHaveText(
    "Net Cash = Gross − EWT (bank). Retained = also net of the VAT you owe. EWT comes back as an income-tax credit (Form 2307)."
  );
});

test("Section 6 — Monthly Cash-In: Jan collected, Dec cumulative == Section 2 (AC7)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  // Jan (month 1) collected 436,050.00; Dec cumulative == the year's collected.
  await expect(page.locator('[data-testid="monthly-row"][data-month="1"]')).toContainText("436,050.00");
  await expect(page.locator('[data-testid="monthly-row"][data-month="12"]')).toContainText("1,908,192.86");
});

test("Section 2 — '—' with no target, then override 15,000,000 lights it up (AC2/AC3)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  // No TargetTable row + no override → target "—" (rule 9, no error).
  await expect(page.getByTestId("target-annual-value")).toHaveText("—");
  await expect(page.getByTestId("tile-pct-of-target-value")).toHaveText("—");
  await expect(page.getByTestId("target-override-badge")).toHaveCount(0);

  // Set the override behind the friction gate (checkbox + optional note).
  await page.getByTestId("target-override-edit").click();
  await expect(page.getByTestId("target-override-gate")).toBeVisible();
  await page.getByTestId("override-amount-input").fill("15000000");
  await page.getByTestId("override-note-input").fill("Board plan for 2026");
  await page.getByTestId("target-override-gate-checkbox").click();
  await page.getByTestId("target-override-gate-confirm").click();

  // Restated: target, override badge, provenance, % and the ahead/behind line.
  await expect(page.getByTestId("target-annual-value")).toHaveText("₱ 15,000,000.00");
  await expect(page.getByTestId("target-override-badge")).toBeVisible();
  await expect(page.getByTestId("tile-pct-of-target-value")).toHaveText("12.72%");
  await expect(page.getByTestId("pace-line")).toHaveAttribute("data-pace", "behind");
  await expect(page.getByTestId("pace-bar")).toBeVisible();

  // Clear the override → reverts to the derived "—".
  await page.getByTestId("target-override-clear").click();
  await expect(page.getByTestId("target-clear-gate")).toBeVisible();
  await page.getByTestId("target-clear-gate-checkbox").click();
  await page.getByTestId("target-clear-gate-confirm").click();
  await expect(page.getByTestId("target-annual-value")).toHaveText("—");
  await expect(page.getByTestId("target-override-badge")).toHaveCount(0);
});

test("year filter restates Sections 2/6 ONLY — Section 1/3 byte-identical (AC13)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  await page.goto("/dashboard");
  const position2026 = await page.getByTestId("section-position").innerHTML();
  const cashTax2026 = await page.getByTestId("section-cash-tax").innerHTML();
  await expect(page.getByTestId("tile-collected-year-value")).toHaveText("₱ 1,908,192.86");

  // Switch the year via the sticky control; the URL carries the view state.
  await page.getByTestId("dashboard-year-filter").selectOption("2025");
  await expect(page).toHaveURL(/year=2025/);

  // Sections 2 & 6 restate: 2025 collected nothing.
  await expect(page.getByTestId("tile-collected-year-value")).toHaveText("₱ 0.00");
  await expect(page.locator('[data-testid="monthly-row"][data-month="12"]')).toContainText("0.00");

  // Sections 1 & 3 are byte-identical — the scope rule (§4 rule 1).
  expect(await page.getByTestId("section-position").innerHTML()).toBe(position2026);
  expect(await page.getByTestId("section-cash-tax").innerHTML()).toBe(cashTax2026);
});

test("drill-downs land on the right filtered views (FR-M6-12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // Balance Outstanding → open receivables with a balance. The cross-route target
  // may compile cold under `next dev`, so the URL assertion is given generous room.
  await page.goto("/dashboard");
  await expect(page.getByTestId("tile-balance-outstanding")).toBeVisible();
  await page.getByTestId("tile-balance-outstanding").click();
  await expect(page).toHaveURL(/\/collectibles\?.*status=open/, { timeout: 30000 });
  await expect(page.getByTestId("rec-status")).toHaveValue("open");
  await expect(page.getByTestId("only-with-balance")).toBeChecked();

  // A monthly row with payments → that month's payments (scoped to the desktop
  // table; the mobile card carries the same link, hidden at this width).
  await page.goto("/dashboard");
  await expect(page.getByTestId("section-monthly")).toBeVisible();
  await page.getByTestId("monthly-table").getByTestId("monthly-link-1").click();
  await expect(page).toHaveURL(/\/payments\?.*year=2026.*month=1/, { timeout: 30000 });
  await expect(page.getByTestId("pay-year")).toHaveValue("2026");
  await expect(page.getByTestId("pay-month")).toHaveValue("1");
});

test("360px: tiles stack, monthly collapses to cards, console clean", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, email);
  await page.goto("/dashboard");

  // The sections all render at 360px; the monthly table collapses to cards.
  await expect(page.getByTestId("section-position")).toBeVisible();
  await expect(page.getByTestId("tile-total-collectible-value")).toHaveText("₱ 6,763,497.25");
  await expect(page.getByTestId("monthly-cards")).toBeVisible();
  await expect(page.locator('[data-testid="monthly-card"]')).toHaveCount(12);
  // No horizontal overflow of the page body (the 360px requirement).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(overflow).toBe(true);

  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});

test("empty workspace renders the empty dashboard with zeros (rule 19)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, emptyEmail);
  await page.goto("/dashboard");

  await expect(page.getByTestId("dashboard-empty")).toBeVisible();
  await expect(page.getByTestId("tile-total-collectible-value")).toHaveText("₱ 0.00");
  await expect(page.getByTestId("tile-pct-collected-value")).toHaveText("—");
  // The sections still render (rule 19), including all 12 monthly rows.
  await expect(page.getByTestId("section-cash-tax")).toBeVisible();
  await expect(page.locator('[data-testid="monthly-row"]')).toHaveCount(12);
});
