import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M9.2 — the Search Console UI, end to end (M9 §9 AC 1–5, 7–9, 12; DoD 1–10 + 12).
 * Provisions its OWN throwaway user, imports the REAL v30.20 workbook through the UI
 * (21 deals + 8 payments, all 2026), archives one deal (D002) directly so the
 * archived-badge path is exercised, then drives the read-only search screen: the
 * three source tabs, the per-source filter bar (year label booked/paid, status +
 * balance on Collectibles only, the sort quirk), the §3.2 result projections to the
 * centavo, row click-through to M1/M4/M5 detail, the shareable URL, the verbatim
 * empty state, and the 360px Filters sheet + card reflow.
 *
 * Skips cleanly when the real workbook is absent; deletes its user after (the
 * membership-delete trigger reaps the workspace → delta-residue zero).
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

const PASSWORD = "throwaway-m92-pw";

async function makeUser(tag: string): Promise<{ uid: string; email: string }> {
  const email = `m92-${tag}-${Date.now()}@throwaway.test`;
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
let workspaceId = "";

test.beforeAll(async () => {
  if (!HAVE_WORKBOOK) return;
  const main = await makeUser("data");
  const empty = await makeUser("empty");
  users.push(main.uid, empty.uid);
  email = main.email;
  emptyEmail = empty.email;
  const { data: m } = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", main.uid)
    .maybeSingle();
  workspaceId = (m as { workspace_id: string } | null)?.workspace_id ?? "";
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

/** Wait for the console to hydrate before driving tabs/selects. */
async function gotoSearch(page: Page, query = "") {
  await page.goto(`/search${query}`);
  await expect(page.getByTestId("search-console")).toHaveAttribute("data-hydrated", "true");
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

  // Archive D002 directly so its receivable/payment/deal rows exercise the badge
  // (Rule 10 — archived records stay findable, with a badge, across all sources).
  if (workspaceId) {
    await admin
      .from("deal")
      .update({ archived_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("deal_code", "D002");
  }
});

test("read-only caption + default tab is Deals (Rule 1, §6)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page);

  await expect(page.getByTestId("search-readonly-caption")).toHaveText(
    "Search is read-only — nothing here changes your data."
  );
  await expect(page.getByTestId("search-tab-deals")).toHaveAttribute("data-active", "true");
  // Year label reads "booked" on Deals (Rule 3 asymmetry made visible).
  await expect(page.getByTestId("search-year")).toHaveAttribute("data-year-label", "Year booked");
});

test("text search 'lainie' on Deals → 3 rows incl D013 NET GCI 906,752.23 (AC1)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page);

  await page.getByTestId("search-text").fill("lainie");
  await expect(page).toHaveURL(/text=lainie/);
  await expect(page.getByTestId("search-count")).toHaveText("3 matching records");
  await expect(page.getByTestId("search-row")).toHaveCount(3);

  const d013 = page.locator('[data-testid="search-row"][data-deal-code="D013"]');
  await expect(d013.getByTestId("search-net-gci")).toContainText("906,752.23");
  await expect(page.locator('[data-testid="search-row"][data-deal-code="D014"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="search-row"][data-deal-code="D015"]')).toHaveCount(1);

  // Padded/cased query normalizes to the same 3 (Rule 4).
  await page.getByTestId("search-text").fill("  LAINIE  ");
  await expect(page.getByTestId("search-row")).toHaveCount(3);
});

test("switching source keeps text, flips the year label, hides status (§6, Rule 6)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=deals&text=ventura");

  // Deals: no status control; year labelled booked.
  await expect(page.getByTestId("search-status")).toHaveCount(0);
  await expect(page.getByTestId("search-year")).toHaveAttribute("data-year-label", "Year booked");

  // → Payments: text preserved, year label flips to paid, still no status.
  await page.getByTestId("search-tab-payments").click();
  await expect(page).toHaveURL(/source=payments/);
  await expect(page).toHaveURL(/text=ventura/);
  await expect(page.getByTestId("search-text")).toHaveValue("ventura");
  await expect(page.getByTestId("search-year")).toHaveAttribute("data-year-label", "Year paid");
  await expect(page.getByTestId("search-status")).toHaveCount(0);

  // → Collectibles: status chips + balance toggle appear.
  await page.getByTestId("search-tab-collectibles").click();
  await expect(page.getByTestId("search-status")).toBeVisible();
  await expect(page.getByTestId("search-only-with-balance")).toBeVisible();
});

test("Collectibles Open + only-with-balance → 14 rows, D013 first (906,752.23), D021 present (AC3)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=collectibles");

  await page.getByTestId("search-status-open").click();
  await expect(page).toHaveURL(/status=open/);
  await page.getByTestId("search-only-with-balance").click();
  await expect(page).toHaveURL(/only_with_balance=true/);

  await expect(page.getByTestId("search-count")).toHaveText("14 matching records");
  await expect(page.getByTestId("search-row")).toHaveCount(14);

  // Balance-desc: D013 is the first row at 906,752.23.
  const first = page.getByTestId("search-row").first();
  await expect(first).toHaveAttribute("data-deal-code", "D013");
  await expect(first.getByTestId("search-balance")).toContainText("906,752.23");

  // D021 present, balance 309,948.98, Status Open.
  const d021 = page.locator('[data-testid="search-row"][data-deal-code="D021"]');
  await expect(d021.getByTestId("search-balance")).toContainText("309,948.98");
  await expect(d021.getByTestId("status-chip-open")).toBeVisible();
});

test("sort selector shows the Collectibles quirk (2 options) vs Deals (3) (Rule 7)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  await gotoSearch(page, "?source=collectibles");
  // Always-balance-desc + one mapping (Date oldest) → exactly 2 options; no amount.
  await expect(page.getByTestId("search-sort").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("search-sort")).toContainText("Balance (high → low)");

  await gotoSearch(page, "?source=deals");
  await expect(page.getByTestId("search-sort").locator("option")).toHaveCount(3);
  await expect(page.getByTestId("search-sort")).toContainText("Highest NET GCI");
});

test("Payments year 2026 → 8 rows, newest first is the D021 release, exact split (AC4)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=payments");

  await page.getByTestId("search-year").selectOption("2026");
  await expect(page).toHaveURL(/year=2026/);
  await expect(page.getByTestId("search-count")).toHaveText("8 matching records");
  await expect(page.getByTestId("search-row")).toHaveCount(8);

  // Default newest-first: the 2026-07-09 D021 incentive release is row 1.
  const first = page.getByTestId("search-row").first();
  await expect(first).toHaveAttribute("data-deal-code", "D021");
  await expect(first.getByTestId("search-gross")).toContainText("50,000.00");
  await expect(first).toContainText("44,642.86"); // Net of VAT
  await expect(first).toContainText("45,535.71"); // Net Cash

  // Year 2025 (paid basis) → the verbatim empty state. The workbook is all-2026 so
  // 2025 isn't in the dropdown; a shared/hand-typed URL still resolves it (Rule 11).
  await gotoSearch(page, "?source=payments&year=2025");
  await expect(page.getByTestId("search-empty-message")).toHaveText(
    "No matching records — adjust your filters above."
  );
});

test("Deal ID D021 across all three sources (AC7)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // Deals: 1 row, NET GCI 354,591.84.
  await gotoSearch(page, "?source=deals");
  await page.getByTestId("search-deal").fill("D021");
  await page.getByTestId("search-deal-option-D021").click();
  await expect(page).toHaveURL(/deal_code=D021/);
  await expect(page.getByTestId("search-row")).toHaveCount(1);
  await expect(page.getByTestId("search-row").first().getByTestId("search-net-gci")).toContainText(
    "354,591.84"
  );

  // Collectibles: 1 row, Balance 309,948.98, Open.
  await gotoSearch(page, "?source=collectibles&deal_code=D021");
  await expect(page.getByTestId("search-row")).toHaveCount(1);
  await expect(page.getByTestId("search-row").first().getByTestId("search-balance")).toContainText(
    "309,948.98"
  );

  // Payments: 1 row, the 50,000 release.
  await gotoSearch(page, "?source=payments&deal_code=D021");
  await expect(page.getByTestId("search-row")).toHaveCount(1);
  await expect(page.getByTestId("search-row").first().getByTestId("search-gross")).toContainText(
    "50,000.00"
  );
});

test("row click-through lands on the M1/M4/M5 detail views (FR-M9-10)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  await gotoSearch(page, "?source=deals&deal_code=D021");
  await expect(page.getByTestId("search-row")).toHaveCount(1);
  await page.getByTestId("search-row-link").first().click();
  await expect(page).toHaveURL(/\/deals\/D021/);

  await gotoSearch(page, "?source=collectibles&deal_code=D021");
  await expect(page.getByTestId("search-row")).toHaveCount(1);
  await page.getByTestId("search-row-link").first().click();
  await expect(page).toHaveURL(/\/collectibles\/D021/);

  await gotoSearch(page, "?source=payments&deal_code=D021");
  await expect(page.getByTestId("search-row")).toHaveCount(1);
  await page.getByTestId("search-row-link").first().click();
  await expect(page).toHaveURL(/\/payments\/[^/]+\/edit/);
});

test("archived deal shows the archived badge (Rule 10 / OQ1)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  // D002 (Ventura) was archived in setup; text 'ventura' → D002 + D003.
  await gotoSearch(page, "?source=deals&text=ventura");
  const d002 = page.locator('[data-testid="search-row"][data-deal-code="D002"]');
  await expect(d002).toHaveCount(1);
  await expect(d002.getByTestId("archived-badge")).toBeVisible();
});

test("shareable URL reproduces the exact view in a fresh session (AC12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=collectibles&status=open&only_with_balance=true");
  await expect(page.getByTestId("search-count")).toHaveText("14 matching records");
  const shared = page.url();

  // Re-open the copied URL — same 14, D013 on top.
  await page.goto(shared);
  await expect(page.getByTestId("search-console")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("search-row")).toHaveCount(14);
  await expect(page.getByTestId("search-row").first()).toHaveAttribute("data-deal-code", "D013");

  // A user from a DIFFERENT workspace gets no data (tenant isolation, Rule 13).
  await page.context().clearCookies();
  await signIn(page, emptyEmail);
  await page.goto(shared);
  await expect(page.getByTestId("search-console")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("search-empty-message")).toHaveText(
    "No matching records — adjust your filters above."
  );
});

test("empty state is verbatim + Clear filters resets (Rule 8 / AC9)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page);

  await page.getByTestId("search-text").fill("zzzznomatch");
  await expect(page.getByTestId("search-empty-message")).toHaveText(
    "No matching records — adjust your filters above."
  );
  await page.getByTestId("search-clear-filters").click();
  await expect(page.getByTestId("search-text")).toHaveValue("");
  await expect(page.getByTestId("search-row").first()).toBeVisible();
});

test("360px — filter bar collapses into a Filters sheet, rows become cards (§6)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, email);
  await gotoSearch(page, "?source=collectibles&status=open&only_with_balance=true");

  // Desktop filter bar is hidden; the Filters trigger carries the active count.
  await expect(page.getByTestId("search-filter-count")).toBeVisible();
  // Rows render as cards, not a table.
  await expect(page.getByTestId("search-card").first()).toBeVisible();
  await expect(page.getByTestId("search-card")).toHaveCount(14);

  // The sheet opens the filter controls.
  await page.getByTestId("search-filters-trigger").click();
  await expect(page.getByText("Filters", { exact: true })).toBeVisible();
});

// === M9.3 — export & hardening =============================================

test("Export CSV of Open+balance reproduces the 14 rows, D013 first, §3.2 columns (AC11)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=collectibles&status=open&only_with_balance=true");
  await expect(page.getByTestId("search-row")).toHaveCount(14);

  // The Export CSV link is a browser download (not a fetch), so catch the event.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-search-csv").click(),
  ]);
  // Filename carries the source + filter hints (repo convention).
  expect(download.suggestedFilename()).toMatch(
    /^zeta-search-collectibles-open-with-balance-\d{4}-\d{2}-\d{2}\.csv$/
  );

  const file = await download.path();
  const text = readFileSync(file!, "utf8").replace(/^﻿/, "");
  const lines = text.trimEnd().split("\r\n");

  // Header = the §3.2 Collectibles columns verbatim; 14 data rows; D013 first.
  expect(lines[0]).toBe(
    "Deal ID,Client,Property,Deal Type,Total Collectible,Collected,Balance,Status"
  );
  expect(lines.length).toBe(15); // header + 14
  expect(lines[1]).toMatch(/^D013,/);
  // Money is the exact stored string, unformatted (the archival copy).
  expect(lines[1]).toContain("906752.23");
  // D021 present with its exact balance.
  expect(lines.some((l) => l.startsWith("D021,") && l.includes("309948.98"))).toBe(true);
});

test("Export XLSX downloads a non-empty spreadsheet", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=collectibles&status=open&only_with_balance=true");
  await expect(page.getByTestId("search-row")).toHaveCount(14);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-search-xlsx").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const file = await download.path();
  // A valid XLSX is a zip — starts with "PK" and has real content.
  const buf = readFileSync(file!);
  expect(buf.length).toBeGreaterThan(0);
  expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
});

test("Export buttons disable at zero rows (§6)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page);
  await page.getByTestId("search-text").fill("zzzznomatch");
  await expect(page.getByTestId("search-empty-message")).toBeVisible();
  await expect(page.getByTestId("export-search-csv")).toBeDisabled();
  await expect(page.getByTestId("export-search-xlsx")).toBeDisabled();
});

test("the export route is read-only — a write verb returns 405 (FR-M9-14)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email); // establishes the auth cookies page.request rides
  for (const verb of ["post", "put", "delete"] as const) {
    const res = await page.request[verb]("/api/export/search?source=deals");
    expect(res.status(), `${verb.toUpperCase()} should be 405`).toBe(405);
  }
});

// === M9.4 — unified "All" tab ==============================================

test("All tab renders three grouped sections; year label neutral, no sort/status (M9.4)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=all");

  await expect(page.getByTestId("search-tab-all")).toHaveAttribute("data-active", "true");
  // Three sections, in §3.2 order, each with the Rule-3 basis annotation.
  await expect(page.getByTestId("search-section-deals")).toBeVisible();
  await expect(page.getByTestId("search-section-collectibles")).toBeVisible();
  await expect(page.getByTestId("search-section-payments")).toBeVisible();
  await expect(page.getByTestId("search-section-deals")).toHaveAttribute("data-year-basis", "booked");
  await expect(page.getByTestId("search-section-collectibles")).toHaveAttribute("data-year-basis", "booked");
  await expect(page.getByTestId("search-section-payments")).toHaveAttribute("data-year-basis", "paid");
  await expect(page.getByTestId("search-section-payments-basis")).toHaveText("by year paid");

  // On the combined tab the year control reads neutral "Year"; sort/status are hidden.
  await expect(page.getByTestId("search-year")).toHaveAttribute("data-year-label", "Year");
  await expect(page.getByTestId("search-sort")).toHaveCount(0);
  await expect(page.getByTestId("search-status")).toHaveCount(0);
});

test("All + text 'lainie' → Deals 3, Collectibles 3, Payments empty state (M9.4 DoD)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=all");

  await page.getByTestId("search-text").fill("lainie");
  await expect(page).toHaveURL(/source=all/);
  await expect(page).toHaveURL(/text=lainie/);

  await expect(page.getByTestId("search-section-deals-count")).toHaveText("3 matching records");
  await expect(page.getByTestId("search-section-collectibles-count")).toHaveText("3 matching records");
  await expect(page.getByTestId("search-section-payments-count")).toHaveText("0 matching records");

  // Deals + Collectibles render 3 rows each; Payments shows the verbatim empty state.
  await expect(
    page.locator('[data-testid="search-section-deals"] [data-testid="search-row"]')
  ).toHaveCount(3);
  await expect(
    page.locator('[data-testid="search-section-collectibles"] [data-testid="search-row"]')
  ).toHaveCount(3);
  await expect(page.getByTestId("search-section-payments-empty")).toHaveText(
    "No matching records — adjust your filters above."
  );
  // Combined count readout across all sources.
  await expect(page.getByTestId("search-count-all")).toHaveText("6");
});

test("All + Deal ID D021 → one row per section with the exact figures (M9.4)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=all&deal_code=D021");

  const dealRow = page.locator('[data-testid="search-section-deals"] [data-testid="search-row"]');
  await expect(dealRow).toHaveCount(1);
  await expect(dealRow.first().getByTestId("search-net-gci")).toContainText("354,591.84");

  const collRow = page.locator('[data-testid="search-section-collectibles"] [data-testid="search-row"]');
  await expect(collRow).toHaveCount(1);
  await expect(collRow.first().getByTestId("search-balance")).toContainText("309,948.98");

  const payRow = page.locator('[data-testid="search-section-payments"] [data-testid="search-row"]');
  await expect(payRow).toHaveCount(1);
  await expect(payRow.first().getByTestId("search-gross")).toContainText("50,000.00");
});

test("All tab — 'view all in tab' carries the shared filters into the source tab", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=all&text=ventura");

  await page.getByTestId("search-section-collectibles-viewall").click();
  await expect(page).toHaveURL(/source=collectibles/);
  await expect(page).toHaveURL(/text=ventura/);
  // Landed on the single-source Collectibles tab with the shared text preserved.
  await expect(page.getByTestId("search-tab-collectibles")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("search-text")).toHaveValue("ventura");
});

test("tab switch All ↔ Deals preserves the text filter (§6)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=deals&text=ventura");

  await page.getByTestId("search-tab-all").click();
  await expect(page).toHaveURL(/source=all/);
  await expect(page.getByTestId("search-text")).toHaveValue("ventura");
  await expect(page.getByTestId("search-section-deals")).toBeVisible();

  await page.getByTestId("search-tab-deals").click();
  await expect(page).toHaveURL(/source=deals/);
  await expect(page.getByTestId("search-text")).toHaveValue("ventura");
});

test("All tab export — multi-sheet XLSX + per-section CSV (M9.4)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await gotoSearch(page, "?source=all&deal_code=D021");

  // Combined workbook (Deals · Collectibles · Payments sheets).
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-search-xlsx").click(),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(/^zeta-search-all-d021-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const xbuf = readFileSync((await xlsx.path())!);
  expect(xbuf.subarray(0, 2).toString("latin1")).toBe("PK"); // a valid zip/xlsx

  // Per-section CSV (the Deals section) — one D021 row, §3.2 Deals columns.
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-search-csv-deals").click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/^zeta-search-deals-d021-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = readFileSync((await csv.path())!, "utf8").replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines[0]).toBe(
    "Deal ID,Date,Transaction,Deal Type,Developer,Client,Property,NET GCI"
  );
  expect(lines.length).toBe(2); // header + the single D021 row
  expect(lines[1]).toMatch(/^D021,/);
  expect(lines[1]).toContain("354591.84");
});

test("All tab at 360px — sections stack, rows become cards (§6)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, email);
  await gotoSearch(page, "?source=all&deal_code=D021");

  // Each section reflows to a card at 360px.
  await expect(
    page.locator('[data-testid="search-section-deals"] [data-testid="search-card"]').first()
  ).toBeVisible();
  await expect(page.getByTestId("search-section-deals-count")).toHaveText("1 matching record");
});
