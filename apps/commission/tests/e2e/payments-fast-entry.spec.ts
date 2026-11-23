import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M5.2 — the fast-entry form & split preview, end to end (acceptance criteria 1,
 * 2, 9, 11, 14). Provisions its OWN throwaway user (a fresh empty workspace,
 * signup-bootstrapped), imports the REAL v30.20 workbook through the UI so the
 * deals + their receivables + the 8 live payments exist, then drives
 * /payments/new: the type-ahead picker, the live engine split, save → toast →
 * undo (with the receivable restated each way), the untaxed and warning contracts,
 * and the 360px one-handed layout. Deletes the user afterwards — delta-residue
 * zero, the real account untouched.
 *
 * Skips cleanly when the real workbook is absent (it is referenced from
 * discovery/source at runtime, never committed into tests/).
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

const PASSWORD = "throwaway-m52-pw";
let uid = "";
let email = "";
let workspaceId = "";

/** Today as an Asia/Manila civil date — what the form pre-fills (rule 20/AC18). */
const MANILA_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

test.beforeAll(async () => {
  if (!HAVE_WORKBOOK) return;
  email = `m52-${Date.now()}@throwaway.test`;
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

/** The receivable balance for a deal, read straight from the DB (exact, robust). */
async function balanceOf(dealCode: string): Promise<string | null> {
  const { data } = await admin
    .from("receivable")
    .select("balance::text")
    .eq("workspace_id", workspaceId)
    .eq("deal_code", dealCode)
    .maybeSingle();
  return (data as { balance: string | null } | null)?.balance ?? null;
}

async function gotoNewPayment(page: Page) {
  await page.goto("/payments/new");
  await expect(page.getByTestId("payment-form")).toHaveAttribute("data-hydrated", "true");
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

  // The importer created D021's ₱50,000 incentive release (WORKBOOK §4), so its
  // receivable is already restated to ₱309,948.98 — the baseline the save test
  // moves from.
  expect(await balanceOf("D021")).toBe("309948.98");
});

test("picker finds D021, the split is live and exact, save restates, undo restores (AC1, AC14)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);

  // Collect any console errors for the "console clean" bar.
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoNewPayment(page);

  // Interaction 1 — the type-ahead picker. "sal" finds "D021 — Daria & John Salon".
  const searchStart = Date.now();
  await page.getByTestId("payment-deal-search").fill("sal");
  await expect(page.getByTestId("payment-deal-option-D021")).toBeVisible();
  const pickerMs = Date.now() - searchStart;
  console.log(`  picker: 'sal' → D021 option visible in ${pickerMs}ms (incl. Playwright overhead)`);
  await page.getByTestId("payment-deal-option-D021").click();
  await expect(page.getByTestId("payment-deal-selected")).toContainText("Daria & John Salon");

  // Date is pre-filled to today, Asia/Manila (AC18).
  await expect(page.getByTestId("field-paymentDate")).toHaveValue(MANILA_TODAY);

  // Interaction 2 — gross. Interaction 3 (for this fixture) — the Incentive toggle.
  await page.getByTestId("field-grossAmount").fill("50000");
  await page.getByTestId("payment-type-incentive").click();

  // The split is LIVE and centavo-exact BEFORE any save (AC1 / D021 fixture).
  await expect(page.getByTestId("split-net-of-vat")).toHaveText("₱ 44,642.86");
  await expect(page.getByTestId("split-vat")).toHaveText("₱ 5,357.14");
  await expect(page.getByTestId("split-ewt")).toHaveText("₱ 4,464.29");
  await expect(page.getByTestId("split-net-cash")).toHaveText("₱ 45,535.71");
  await expect(page.getByTestId("split-retained")).toHaveText("₱ 40,178.57");

  const before = await balanceOf("D021"); // 309,948.98

  // Save → toast with the stored split + undo.
  await page.getByTestId("payment-submit").click();
  await expect(page.getByTestId("payment-save-toast")).toBeVisible();
  await expect(page.getByTestId("payment-save-toast")).toContainText("Net Cash");
  await expect(page.getByTestId("payment-undo")).toBeVisible();

  // M4 restated the receivable synchronously: balance dropped by the net of VAT
  // (44,642.86). before − after = 44,642.86, to the centavo.
  await expect
    .poll(async () => await balanceOf("D021"), { timeout: 5000 })
    .toBe("265306.12");
  console.log(`  balance moved: ${before} → 265306.12 (−44,642.86)`);

  // Undo — the friction-free soft-delete restores the balance.
  await page.getByTestId("payment-undo").click();
  await expect(page.getByTestId("payment-undone")).toBeVisible();
  await expect.poll(async () => await balanceOf("D021"), { timeout: 5000 }).toBe("309948.98");
  console.log(`  undo restored balance → 309948.98`);

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("an untaxed deal (D004, N/A) previews net = gross with VAT = EWT = 0 (AC2)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await gotoNewPayment(page);

  await page.getByTestId("payment-deal-search").fill("D004");
  await page.getByTestId("payment-deal-option-D004").click();
  await page.getByTestId("field-grossAmount").fill("875000");

  // Rule P2 — untaxed pass-through: K = H, L = M = 0, N = H.
  await expect(page.getByTestId("split-net-of-vat")).toHaveText("₱ 875,000.00");
  await expect(page.getByTestId("split-vat")).toHaveText("₱ 0.00");
  await expect(page.getByTestId("split-ewt")).toHaveText("₱ 0.00");
  await expect(page.getByTestId("split-net-cash")).toHaveText("₱ 875,000.00");
  await expect(page.getByTestId("split-untaxed-badge")).toBeVisible();
});

test("a pre-booking date warns amber but still saves (AC11)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await gotoNewPayment(page);

  // D021 booked 2026-07-10; a release dated before that warns (rule 9), never blocks.
  await page.getByTestId("payment-deal-search").fill("sal");
  await page.getByTestId("payment-deal-option-D021").click();
  await page.getByTestId("field-paymentDate").fill("2026-07-01");
  await page.getByTestId("field-grossAmount").fill("10000");

  await expect(page.getByTestId("payment-warning-pre_booking_date")).toBeVisible();
  await expect(page.getByTestId("payment-submit")).toHaveText(/Log anyway/);

  // The save proceeds past the amber warning.
  await page.getByTestId("payment-submit").click();
  await expect(page.getByTestId("payment-save-toast")).toBeVisible();
  // Tidy up so the balance stays at its baseline for any later run.
  await page.getByTestId("payment-undo").click();
  await expect(page.getByTestId("payment-undone")).toBeVisible();
});

test("logging against a Closed receivable warns and the reopen prompt is live (rule 7)", async ({
  page,
}) => {
  // Updated: M4.3 makes the reopen action live (was a disabled/deferred prompt), 2026-07-18.
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  // Close D005's receivable directly, then prove the fast-entry banner reopens it.
  const { error } = await admin
    .from("receivable")
    .update({ status: "closed" })
    .eq("workspace_id", workspaceId)
    .eq("deal_code", "D005");
  expect(error).toBeNull();

  await signIn(page);
  await gotoNewPayment(page);

  await page.getByTestId("payment-deal-search").fill("D005");
  await page.getByTestId("payment-deal-option-D005").click();
  await page.getByTestId("field-grossAmount").fill("10000");

  // The amber banner names the status and offers reopen (now ENABLED — M4.3).
  await expect(page.getByTestId("payment-warning-receivable_closed")).toBeVisible();
  const reopen = page.getByTestId("payment-reopen-receivable");
  await expect(reopen).toBeVisible();
  await expect(reopen).toBeEnabled();
  await expect(page.getByTestId("payment-submit")).toHaveText(/Log anyway/);

  // Reopen → the receivable goes Open, the preview re-runs and the Closed warning
  // clears (the submit returns to "Log release").
  await reopen.click();
  await expect(page.getByTestId("payment-warning-receivable_closed")).toBeHidden();
  await expect(page.getByTestId("payment-submit")).toHaveText(/Log release/);

  // The receivable is Open again server-side.
  const { data } = await admin
    .from("receivable")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("deal_code", "D005")
    .single();
  expect((data as { status: string } | null)?.status).toBe("open");
});

test("the form is usable one-handed at 360px (mobile)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await gotoNewPayment(page);

  // The picker, gross and the thumb-reach save are all present and reachable.
  await page.getByTestId("payment-deal-search").fill("D004");
  await page.getByTestId("payment-deal-option-D004").click();
  await page.getByTestId("field-grossAmount").fill("875000");
  await expect(page.getByTestId("split-preview")).toBeVisible();
  await expect(page.getByTestId("payment-submit")).toBeVisible();

  // No horizontal overflow at 360 — the one-handed requirement.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= 362
  );
  expect(overflow).toBe(true);
});
