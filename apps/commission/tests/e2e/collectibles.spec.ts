import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M4.4 — the receivables ledger + detail view, end to end (M4 §9 AC 1–15). Provisions
 * its OWN throwaway user (a fresh empty workspace, signup-bootstrapped), imports the
 * REAL v30.20 workbook through the UI so the 21 receivables + the 8 live payments
 * exist, then drives /collectibles and /collectibles/[dealCode]: the chase-priority
 * default order, the pinned totals row (exact), filters, the ⚠-chase flag, the
 * booked-vs-collectible explainer, payment history, the Close/Cancel/Reopen dialogs,
 * the "Adjust…" Corrections flow, the Confirmed Collectible override, filtered export
 * and the 360px card layout. Deletes the user afterwards — delta-residue zero.
 *
 * Skips cleanly when the real workbook is absent (referenced from discovery/source at
 * runtime, never committed into tests/).
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

const PASSWORD = "throwaway-m44-pw";
let uid = "";
let email = "";
let workspaceId = "";

test.beforeAll(async () => {
  if (!HAVE_WORKBOOK) return;
  email = `m44-${Date.now()}@throwaway.test`;
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

// Cast every read to ::text so money keeps its scale ("675000.00") and never
// arrives as a JSON float; status::text yields the enum label.
async function fieldOf(dealCode: string, column: string): Promise<string | null> {
  const { data } = await admin
    .from("receivable")
    .select(`${column}::text`)
    .eq("workspace_id", workspaceId)
    .eq("deal_code", dealCode)
    .maybeSingle();
  return (data as Record<string, string | null> | null)?.[column] ?? null;
}

test("import the real v30.20 workbook", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present in discovery/source");
  await signIn(page);
  await page.goto("/deals/import");
  await page.getByTestId("import-file").setInputFiles(REAL_WORKBOOK);
  await page.getByTestId("import-dry-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-done")).toContainText("21 deals");
});

test("ledger — chase-priority default order + exact pinned totals (AC11)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await signIn(page);
  await page.goto("/collectibles");
  await expect(page.getByTestId("receivable-table")).toBeVisible();

  // Default order = Rule Q chase priority (M4.2's verified order).
  const codes = await page.locator('[data-testid="receivable-row"]').evaluateAll((rows) =>
    rows.map((r) => r.getAttribute("data-code"))
  );
  expect(codes.slice(0, 4)).toEqual(["D013", "D005", "D016", "D010"]);

  // Pinned totals row — full-precision sums of the whole (unfiltered) set.
  await expect(page.getByTestId("total-collectible")).toHaveText("₱ 6,763,497.25");
  await expect(page.getByTestId("total-collected")).toHaveText("₱ 1,908,192.86");
  await expect(page.getByTestId("total-balance")).toHaveText("₱ 4,855,304.39");

  expect(errors).toEqual([]);
});

test("ledger — only-with-balance shows exactly the open rows that owe money", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles");

  // Ground truth from the DB: open, non-archived, balance > 0.
  const { data } = await admin
    .from("receivable")
    .select("deal_code,balance::text,status")
    .eq("workspace_id", workspaceId)
    .eq("status", "open")
    .is("archived_at", null);
  const openWithBalance = (data ?? []).filter((r) => Number((r as { balance: string }).balance) > 0);

  await page.getByTestId("only-with-balance").click();
  await expect
    .poll(async () => page.locator('[data-testid="receivable-row"]').count())
    .toBe(openWithBalance.length);
  console.log(`  only-with-balance → ${openWithBalance.length} rows (open, balance > 0)`);
});

test("ledger — ⚠ chase flag appears when a row is idle ≥ the settings threshold", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  // Make D016 look long-idle by back-dating its last payment (UI-render check).
  await admin
    .from("receivable")
    .update({ last_payment_date: "2025-01-01" })
    .eq("workspace_id", workspaceId)
    .eq("deal_code", "D016");

  await signIn(page);
  await page.goto("/collectibles");
  const row = page.locator('[data-testid="receivable-row"][data-code="D016"]');
  await expect(row.getByTestId("chase-flag")).toBeVisible();

  // Undo the fixture nudge so later assertions see the real state.
  await admin
    .from("receivable")
    .update({ last_payment_date: null })
    .eq("workspace_id", workspaceId)
    .eq("deal_code", "D016");
});

test("detail D021 — explainer verbatim, arithmetic, payment history, balance (AC3, AC9)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles/D021");

  // Header doctrine, byte-exact.
  await expect(page.getByText(
    "Booked NET GCI = earned after referral-outs; Total Collectible = full cash you expect in (you pay referrers separately — tracked on the Dashboard)."
  )).toBeVisible();

  // Rule K.2 arithmetic: GCI 318,877.55 + incentive 35,714.29 = 354,591.84.
  const arithmetic = page.getByTestId("collectible-arithmetic");
  await expect(arithmetic).toContainText("318,877.55");
  await expect(arithmetic).toContainText("35,714.29");
  await expect(arithmetic).toContainText("354,591.84");

  // Computed balance and the 07-09 incentive release in the history.
  await expect(page.getByTestId("detail-balance")).toContainText("309,948.98");
  const history = page.getByTestId("payment-history");
  await expect(history).toContainText("Jul 9, 2026");
  await expect(history).toContainText("44,642.86");
});

test("detail — Close warns on balance, freezes variance; then Reopen resumes (AC4, AC15)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles/D021");

  await page.getByTestId("close-trigger").click();
  // Warns on the non-zero balance and previews the variance.
  await expect(page.getByTestId("close-gate-consequence")).toContainText("309,948.98");
  await page.getByTestId("close-gate-checkbox").click();
  await page.getByTestId("close-gate-confirm").click();

  // Closed → variance = collected − collectible = −309,948.98, frozen for display.
  await expect(page.getByTestId("detail-variance")).toContainText("309,948.98");
  await expect.poll(async () => fieldOf("D021", "status")).toBe("closed");

  // Reopen restores Open math — wait for the page to revert to the Open state
  // (close/cancel triggers reappear, variance disappears) before reading the DB.
  await page.getByTestId("reopen-trigger").click();
  await page.getByTestId("reopen-gate-checkbox").click();
  await page.getByTestId("reopen-gate-confirm").click();
  await expect(page.getByTestId("close-trigger")).toBeVisible();
  await expect(page.getByTestId("detail-variance")).toHaveCount(0);
  await expect.poll(async () => fieldOf("D021", "status")).toBe("open");
});

test("detail — Cancel requires a reason and writes off the remainder (AC6)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles/D005"); // open, unpaid, collectible 675,000

  // Attempt 1: tick the gate but leave the reason blank → rejected server-side.
  await page.getByTestId("cancel-trigger").click();
  await expect(page.getByTestId("cancel-gate-consequence")).toContainText("675,000.00");
  // M10.4 (P8, AC8): the dialog shows the Closed-vs-Cancelled doctrine verbatim
  // alongside the write-off amount, before confirm.
  await expect(page.getByTestId("status-doctrine-p8")).toContainText(
    "the uncollected balance is"
  );
  await expect(page.getByTestId("status-doctrine-p8")).toContainText("written off");
  const checkbox = page.getByTestId("cancel-gate-checkbox");
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("data-checked", "");
  await page.getByTestId("cancel-gate-confirm").click();
  await expect(page.getByTestId("cancel-gate-error")).toContainText("reason");
  expect(await fieldOf("D005", "status")).toBe("open"); // nothing changed
  await page.getByTestId("cancel-gate-cancel").click();

  // Attempt 2: a fresh dialog with the required reason → cancelled, written off 675,000.
  await page.getByTestId("cancel-trigger").click();
  await page.getByTestId("cancel-reason").fill("Buyer withdrew — reservation void.");
  const checkbox2 = page.getByTestId("cancel-gate-checkbox");
  await checkbox2.click();
  await expect(checkbox2).toHaveAttribute("data-checked", "");
  await page.getByTestId("cancel-gate-confirm").click();
  await expect.poll(async () => fieldOf("D005", "status")).toBe("cancelled");
  expect(await fieldOf("D005", "written_off")).toBe("675000.00");

  // The detail view now shows the write-off.
  await page.goto("/collectibles/D005");
  await expect(page.getByTestId("detail-written-off")).toContainText("675,000.00");
});

// Updated: M10.4 upgraded the "Adjust…" panel into the FR-M10-13 two-question
// mini-flow ("A number changed — which case am I in?"). The three cases are now
// gated behind Q1/Q2 rather than shown at once, and each terminal case renders the
// P6 doctrine verbatim. 2026-07-19.
test("detail — the Corrections mini-flow routes all three cases (§3.3, FR-M10-13, AC7)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles/D007");

  await page.getByTestId("adjust-toggle").click();
  const panel = page.getByTestId("adjust-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("adjust-q1")).toBeVisible();

  // Q1 = Yes → case 1: edit the deal (deep link to M1 edit).
  await panel.getByTestId("adjust-q1-yes").click();
  await expect(panel.getByTestId("adjust-case-1")).toBeVisible();
  await expect(panel.getByTestId("adjust-edit-deal")).toHaveAttribute("href", "/deals/D007/edit");

  // Q1 = No, Q2 = No → case 3: close short (its own Close dialog).
  await panel.getByTestId("adjust-restart").click();
  await panel.getByTestId("adjust-q1-no").click();
  await expect(panel.getByTestId("adjust-q2")).toBeVisible();
  await panel.getByTestId("adjust-q2-no").click();
  await expect(panel.getByTestId("adjust-case-3")).toBeVisible();
  await expect(panel.getByTestId("close-trigger")).toBeVisible();

  // Q1 = No, Q2 = Yes → case 2: reveals the Confirmed Collectible override (AC7).
  await panel.getByTestId("adjust-restart").click();
  await panel.getByTestId("adjust-q1-no").click();
  await panel.getByTestId("adjust-q2-yes").click();
  await expect(panel.getByTestId("adjust-case-2")).toBeVisible();
  await panel.getByTestId("adjust-confirm-collectible").click();
  await expect(page.getByTestId("override-panel")).toBeVisible();
});

test("detail — Confirmed Collectible: note required, set turns it overridden, clear reverts (AC8)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles/D007"); // default collectible 180,000

  await page.getByTestId("show-override").click();
  await page.getByTestId("override-amount").fill("150000");
  // Save with no note → blocked (edge case 17).
  await page.getByTestId("override-save").click();
  await expect(page.getByTestId("form-error")).toContainText("note");

  await page.getByTestId("override-note").fill("CLI advice: base excl. promo disc — confirmed 150,000");
  await page.getByTestId("override-save").click();
  await expect(page.getByTestId("form-message")).toBeVisible();
  expect(await fieldOf("D007", "confirmed_collectible")).toBe("150000.00");
  expect(await fieldOf("D007", "total_collectible")).toBe("150000.00");

  // The ledger renders it in the overridden (blue) style.
  await page.goto("/collectibles");
  const row = page.locator('[data-testid="receivable-row"][data-code="D007"]');
  await expect(row.getByTestId("overridden-collectible")).toBeVisible();

  // Clear → reverts to the booked default 180,000.
  await page.goto("/collectibles/D007");
  await page.getByTestId("override-clear").click();
  await expect
    .poll(async () => fieldOf("D007", "confirmed_collectible"))
    .toBeNull();
  expect(await fieldOf("D007", "total_collectible")).toBe("180000.00");
});

test("ledger — export links carry the active filters (AC8)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page);
  await page.goto("/collectibles");

  await page.getByTestId("rec-status").selectOption("open");
  await page.getByTestId("only-with-balance").click();

  const href = await page.getByTestId("export-csv").getAttribute("href");
  expect(href).toContain("format=csv");
  expect(href).toContain("status=open");
  expect(href).toContain("hasBalance=true");
});

test("mobile — the ledger collapses to cards at 360px", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await page.goto("/collectibles");
  await expect(page.getByTestId("receivable-cards")).toBeVisible();
  await expect(page.locator('[data-testid="receivable-card"]').first()).toBeVisible();
  // No horizontal overflow at 360px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(overflow).toBe(true);
});
