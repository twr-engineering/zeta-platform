import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M5.3 — the payments list, per-deal panel, edit/recompute & exports, end to end
 * (acceptance criteria 7 UI leg, 13, 15, 17). Provisions its OWN throwaway user (a
 * fresh empty workspace, signup-bootstrapped), imports the REAL v30.20 workbook
 * through the UI so the 8 live payments exist, then drives /payments: newest-first
 * with exact splits, filters, filter-aware export links, the friction-gated edit
 * (re-snapshot + synchronous receivable restatement), the stale-basis indicator +
 * opt-in per-payment recompute, delete, and the per-deal panel running total.
 * Deletes the user afterwards — delta-residue zero, the real account untouched.
 *
 * Skips cleanly when the real workbook is absent (referenced from discovery/source
 * at runtime, never committed into tests/).
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

const PASSWORD = "throwaway-m53-pw";
let uid = "";
let email = "";
let workspaceId = "";

test.beforeAll(async () => {
  if (!HAVE_WORKBOOK) return;
  email = `m53-${Date.now()}@throwaway.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  uid = data.user!.id;
  const { data: m } = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", uid)
    .maybeSingle();
  workspaceId = (m as { workspace_id: string } | null)?.workspace_id ?? "";
});

test.afterAll(async () => {
  if (uid) await admin.auth.admin.deleteUser(uid);
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function dealIdOf(dealCode: string): Promise<string> {
  const { data } = await admin
    .from("deal")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("deal_code", dealCode)
    .single();
  return (data as { id: string }).id;
}

async function paymentIdOf(dealCode: string): Promise<string> {
  const { data } = await admin
    .from("payment")
    .select("id")
    .eq("deal_id", await dealIdOf(dealCode))
    .is("archived_at", null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? "";
}

async function splitOf(
  dealCode: string
): Promise<{ net_of_vat: string; ewt_amount: string; ewt_rate_used: string } | null> {
  const { data } = await admin
    .from("payment")
    .select("net_of_vat::text, ewt_amount::text, ewt_rate_used::text")
    .eq("deal_id", await dealIdOf(dealCode))
    .is("archived_at", null)
    .maybeSingle();
  return data as { net_of_vat: string; ewt_amount: string; ewt_rate_used: string } | null;
}

async function balanceOf(dealCode: string): Promise<string | null> {
  const { data } = await admin
    .from("receivable")
    .select("balance::text")
    .eq("workspace_id", workspaceId)
    .eq("deal_code", dealCode)
    .maybeSingle();
  return (data as { balance: string | null } | null)?.balance ?? null;
}

/**
 * Change the workspace EWT rate through the REAL settings flow (the money-restating
 * confirm gate) — the honest path, and the one that invalidates the tax-settings
 * cache the engine reads, so the recompute preview + save re-snapshot at the new
 * rate. `percent` is the whole-percent form the field takes ("5", "10").
 */
async function setEwtRateViaUI(page: Page, percent: string) {
  await page.goto("/settings/tax");
  await expect(page.getByTestId("ewt-rate-input")).toBeVisible();
  await page.getByTestId("ewt-rate-input").fill(percent);
  await page.getByTestId("save-tax-settings-button").click();
  await expect(page.getByTestId("tax-confirm-gate")).toBeVisible();
  await page.getByTestId("tax-confirm-gate-checkbox").click();
  await page.getByTestId("tax-confirm-gate-confirm").click();
  await expect(page.getByTestId("form-message")).toBeVisible();
}

/** Open a payment's edit screen, wait for the split comparison to be present. */
async function gotoEdit(page: Page, dealCode: string) {
  const id = await paymentIdOf(dealCode);
  await page.goto(`/payments/${id}/edit`);
  await expect(page.getByTestId("split-comparison")).toBeVisible();
}

/** Confirm a friction-gated ConfirmGate action (mode "checked"). */
async function confirmGate(page: Page, testId: string) {
  await page.getByTestId(`${testId}-checkbox`).click();
  await page.getByTestId(`${testId}-confirm`).click();
}

test("import the real v30.20 workbook into the throwaway workspace", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present in discovery/source");
  await signIn(page);

  await page.goto("/deals/import");
  await page.getByTestId("import-file").setInputFiles(REAL_WORKBOOK);
  await page.getByTestId("import-dry-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-done")).toContainText("21 deals");

  expect(await balanceOf("D021")).toBe("309948.98");
});

test("the list shows the 8 payments newest-first with exact splits (AC13)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await signIn(page);
  await page.goto("/payments");

  await expect(page.getByTestId("payment-table")).toBeVisible();
  await expect(page.getByTestId("payment-row")).toHaveCount(8);

  // Newest first (rule 18): D021's 2026-07-09 incentive release leads, with its
  // stored split centavo-exact (AC1 fixture).
  const first = page.getByTestId("payment-row").first();
  await expect(first).toContainText("D021");
  await expect(first).toContainText("₱ 44,642.86"); // net of VAT
  await expect(first).toContainText("₱ 4,464.29"); // EWT
  await expect(first).toContainText("₱ 45,535.71"); // net cash
  await expect(first.getByTestId("type-badge-incentive")).toBeVisible();

  // The untaxed rows read "untaxed" in the VAT/EWT cells, not a bare ₱0.00 (§6.4).
  const d004 = page.locator('[data-testid="payment-row"]', { hasText: "D004" });
  await expect(d004).toContainText("untaxed");

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("filters narrow the set and the export links carry them (AC15)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/payments");
  await expect(page.getByTestId("payments-list")).toHaveAttribute("data-hydrated", "true");

  // Type = Incentive → only D021 among the 8.
  await page.getByTestId("pay-type").selectOption("incentive");
  await expect(page.getByTestId("payment-row")).toHaveCount(1);
  await expect(page.getByTestId("result-count")).toHaveText("1 payment");

  // The export links honour the on-screen filter (AC15).
  await expect(page.getByTestId("export-csv")).toHaveAttribute("href", /type=incentive/);
  await expect(page.getByTestId("export-xlsx")).toHaveAttribute("href", /type=incentive/);

  // Back to all, then a text search over the joined identity.
  await page.getByTestId("pay-type").selectOption("all");
  await expect(page.getByTestId("payment-row")).toHaveCount(8);
  await page.getByTestId("pay-search").fill("D004");
  await expect(page.getByTestId("payment-row")).toHaveCount(1);
  await expect(page.getByTestId("payment-row").first()).toContainText("D004");

  // Year paid — every live release is 2026.
  await page.getByTestId("pay-search").fill("");
  await page.getByTestId("pay-year").selectOption("2026");
  await expect(page.getByTestId("payment-row")).toHaveCount(8);
});

test("editing gross re-snapshots the split and restates the receivable synchronously (§3.3.2)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await gotoEdit(page, "D021");

  // The side-by-side updates: gross 50,000 → 60,000 recomputes Net of VAT 53,571.43.
  await page.getByTestId("edit-grossAmount").fill("60000");
  await expect(page.getByTestId("split-comparison")).toContainText("₱ 53,571.43");
  await expect(page.getByTestId("split-changed").first()).toBeVisible();

  // Friction-gated save (rule 11) → re-snapshot.
  await page.getByTestId("payment-edit-trigger").click();
  await confirmGate(page, "payment-edit");
  await expect(page).toHaveURL(/\/payments$/);

  // Stored split re-snapshotted, and the receivable moved synchronously:
  // Collected = 53,571.43 → Balance = 354,591.84 − 53,571.43 = 301,020.41.
  await expect.poll(async () => (await splitOf("D021"))?.net_of_vat).toBe("53571.43");
  await expect.poll(async () => await balanceOf("D021")).toBe("301020.41");

  // Revert to keep the fixture balance for the stale test.
  await gotoEdit(page, "D021");
  await page.getByTestId("edit-grossAmount").fill("50000");
  await page.getByTestId("payment-edit-trigger").click();
  await confirmGate(page, "payment-edit");
  await expect(page).toHaveURL(/\/payments$/);
  await expect.poll(async () => await balanceOf("D021")).toBe("309948.98");
});

test("an EWT rate change flags stale rows; recompute is opt-in and per-payment (AC7, §3.3.3)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);

  // A workspace rate change never rewrites stored splits — it surfaces them as stale.
  await setEwtRateViaUI(page, "5");

  await page.goto("/payments");
  // All 8 rows were captured at EWT 10%; each now differs from the current 5%.
  // (Scope to the desktop table — the mobile cards mirror each row in the DOM.)
  const tableStale = page.getByTestId("payment-table").getByTestId("stale-basis-flag");
  await expect(tableStale).toHaveCount(8);

  // Opt into recompute for ONE row (D021) — the edit screen shows the drift.
  await gotoEdit(page, "D021");
  await expect(page.getByTestId("stale-basis-banner")).toBeVisible();
  // At EWT 5% the recomputed EWT is 2,232.14 (AC6).
  await expect(page.getByTestId("split-comparison")).toContainText("₱ 2,232.14");
  await expect(page.getByTestId("payment-edit-trigger")).toHaveText(/Recompute this payment/);
  await page.getByTestId("payment-edit-trigger").click();
  await confirmGate(page, "payment-edit");
  await expect(page).toHaveURL(/\/payments$/);

  // Only D021 re-snapshotted (EWT 2,232.14 @ 0.0500); the others are untouched.
  await expect.poll(async () => (await splitOf("D021"))?.ewt_amount).toBe("2232.14");
  await expect.poll(async () => (await splitOf("D021"))?.ewt_rate_used).toBe("0.0500");
  expect((await splitOf("D006"))?.ewt_rate_used).toBe("0.1000");

  // The list now flags the remaining 7, not D021.
  await page.goto("/payments");
  await expect(page.getByTestId("payment-table").getByTestId("stale-basis-flag")).toHaveCount(7);

  // Restore the rate and recompute D021 back so the fixture is whole again.
  await setEwtRateViaUI(page, "10");
  await gotoEdit(page, "D021");
  await page.getByTestId("payment-edit-trigger").click();
  await confirmGate(page, "payment-edit");
  await expect(page).toHaveURL(/\/payments$/);
  await expect.poll(async () => (await splitOf("D021"))?.ewt_amount).toBe("4464.29");
  await expect.poll(async () => await balanceOf("D021")).toBe("309948.98");
});

test("deleting a payment is friction-gated and restates the receivable (AC8/rule 10)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);

  const before = Number(await balanceOf("D019")); // untaxed 10,000 release
  await gotoEdit(page, "D019");
  await page.getByTestId("payment-delete-trigger").click();
  await confirmGate(page, "payment-delete");
  await expect(page).toHaveURL(/\/payments$/);

  // Balance restored by the deleted payment's Net of VAT (10,000, untaxed).
  await expect
    .poll(async () => Number(await balanceOf("D019")))
    .toBeCloseTo(before + 10000, 2);
  // The payment is soft-deleted — gone from the active list.
  expect(await paymentIdOf("D019")).toBe("");
});

test("the per-deal panel shows the running collected total (AC17)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);

  // On the deal detail — the panel M5.3 added (was a bare cross-link).
  await page.goto("/deals/D021");
  const panel = page.getByTestId("deal-payments-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("deal-payments-running-total")).toContainText("₱ 44,642.86");
  await expect(panel.getByTestId("deal-payments-running-total")).toContainText("₱ 354,591.84");
});

test("the list collapses to cards at 360px with no horizontal overflow", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.goto("/payments");

  await expect(page.getByTestId("payment-cards")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= 362);
  expect(overflow).toBe(true);
});
