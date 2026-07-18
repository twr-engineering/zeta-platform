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
let mainUid = "";

test.beforeAll(async () => {
  if (!HAVE_WORKBOOK) return;
  const main = await makeUser("data");
  const empty = await makeUser("empty");
  users.push(main.uid, empty.uid);
  email = main.email;
  emptyEmail = empty.email;
  mainUid = main.uid;
});

/** The workspace id the throwaway agent owns — for admin-scoped Data Health seeding. */
async function workspaceOf(uid: string): Promise<string> {
  const { data, error } = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", uid)
    .single();
  if (error) throw error;
  return (data as { workspace_id: string }).workspace_id;
}

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

test("Section 4 — Aging buckets 9/0/5/0 + TOTAL ties to Balance Outstanding (AC5)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  // The clock is live, so a booking-age deal can cross a month boundary from the
  // frozen 2026-07-17 counts. Assert the invariant that never rots: the four
  // bucket counts sum to 14 and the TOTAL balance ties to Balance Outstanding.
  const bucketCount = async (key: string) =>
    Number(
      await page
        .locator(`[data-testid="aging-row"][data-bucket="${key}"] td:nth-child(2)`)
        .innerText()
    );
  const total =
    (await bucketCount("lt1")) +
    (await bucketCount("m1to3")) +
    (await bucketCount("m3to6")) +
    (await bucketCount("m6plus"));
  expect(total).toBe(14);

  await expect(page.getByTestId("aging-total-balance")).toHaveText("₱ 4,855,304.39");
  // The tie is SHOWN, not hidden (rule 4) — green ✓ at import (no overpaid rows).
  await expect(page.getByTestId("aging-tie")).toHaveAttribute("data-ties", "true");
  await expect(page.getByTestId("aging-tie")).toContainText("4,855,304.39");
});

test("Section 5 — By developer: Abrown 5.71%/−1, Resale 62.90%/64.6, TOTAL ties (AC6)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  // The "Resale / Rental (no developer)" row: collected 1,863,550.00 @ 62.90% / 64.6 days.
  const resale = page.locator('[data-testid="by-developer-row"][data-developer="none"]');
  await expect(resale).toContainText("₱ 1,863,550.00");
  await expect(resale).toContainText("62.90%");
  await expect(resale).toContainText("64.6");

  // Abrown Inc. — 5.71% collected, avg days −1 (release precedes booking, legal).
  const abrown = page.locator('[data-testid="by-developer-row"]', {
    hasText: "Abrown Inc.",
  });
  await expect(abrown).toContainText("5.71%");
  // Rendered with an ASCII hyphen (String(-1)), not the PRD prose's unicode minus.
  await expect(abrown).toContainText("-1");

  // TOTAL ties to Section 1 (balance 4,855,304.39; collected 1,908,192.86).
  await expect(page.getByTestId("by-developer-total-balance")).toHaveText("₱ 4,855,304.39");
  await expect(page.getByTestId("by-developer-total-collected")).toHaveText("₱ 1,908,192.86");
});

test("Section 7 — Data Health all-clear at import (AC8 baseline)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  await expect(page.getByTestId("data-health-all-clear")).toBeVisible();
  for (const id of ["b", "c", "d", "stale"]) {
    await expect(page.getByTestId(`health-check-${id}`)).toHaveAttribute("data-ok", "true");
  }
});

test("Section 4/5 drill-downs land on the filtered views (FR-M6-12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // An aging bucket → open, balance-owing receivables in that age band.
  await page.goto("/dashboard");
  await page.getByTestId("aging-link-lt1").click();
  await expect(page).toHaveURL(/\/collectibles\?.*bucket=lt1/, { timeout: 30000 });
  await expect(page.getByTestId("rec-status")).toHaveValue("open");
  await expect(page.getByTestId("rec-age")).toHaveValue("lt1");
  await expect(page.getByTestId("only-with-balance")).toBeChecked();

  // The "Resale / Rental (no developer)" row → the no-developer receivables.
  await page.goto("/dashboard");
  await page.getByTestId("by-developer-link-none").click();
  await expect(page).toHaveURL(/\/collectibles\?.*developer=none/, { timeout: 30000 });
  await expect(page.getByTestId("rec-developer")).toHaveValue("none");
});

// --- Section 8 — Chase list (M6.4) ------------------------------------------
// These read/write the PRISTINE 14-open chase state, so they are declared BEFORE
// the Data Health test below (serial mode = declaration order), which mutates D001/
// D002/D004 balances and would drop D002 out of the chase list.

test("Section 8 — chase order D013 → D005 → D016 → D010, chips, >30 banner absent (AC10)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  // Ordered by the chase contract (balance DESC, idle DESC, deal_code) — Rule Q / OQ1.
  const table = page.getByTestId("chase-table");
  const codes = await table.getByTestId("chase-row").evaluateAll((rows) =>
    rows.map((r) => r.getAttribute("data-deal"))
  );
  expect(codes.slice(0, 4)).toEqual(["D013", "D005", "D016", "D010"]);
  expect(codes).toHaveLength(14);

  // 13 never-paid rows read "no payment yet"; D013 (top, never paid) is one of them.
  const d013 = table.locator('[data-testid="chase-row"][data-deal="D013"]');
  await expect(d013.getByTestId("chase-follow-up")).toHaveAttribute(
    "data-follow-up",
    "no_payment_yet"
  );

  // D021 has a release (2026-07-09): clock-independent balance + last-payment date,
  // and it is NOT "no payment yet". (The frozen idle-0 / "ok" value is unit-pinned;
  // the chip transition is proven clock-robustly by the chase_idle_months test below.)
  const d021 = table.locator('[data-testid="chase-row"][data-deal="D021"]');
  await expect(d021.getByTestId("chase-balance")).toHaveText("₱ 309,948.98");
  // Last payment 2026-07-09 → rendered "Jul 9, 2026" (clock-independent stored date).
  await expect(d021).toContainText("Jul 9, 2026");
  await expect(d021.getByTestId("chase-follow-up")).not.toHaveAttribute(
    "data-follow-up",
    "no_payment_yet"
  );

  // 14 open balances < 30 → no collections-sprint banner (guards a false-positive).
  await expect(page.getByTestId("chase-over-thirty")).toHaveCount(0);
});

test("Section 8 — an idle paid row shows ⚠ chase; never-paid stays 'no payment yet' (AC11, rule 14)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const ws = await workspaceOf(mainUid);
  // Age D021's single release far past the default 3-month chase threshold so its chip
  // is DETERMINISTIC on the live clock (the frozen idle-0 "ok" is unit-pinned; the
  // three-state precedence is proven deterministically in projections.test.ts). This
  // exercises the real "⚠ chase" branch (months_idle ≥ chase_idle_months) on a browser
  // render — months_idle is recomputed live from last_payment_date (no cache). D013
  // (never paid) keeps "no payment yet" by precedence (rule 14), threshold regardless.
  // (chase_idle_months itself has a DB minimum of 1 and is cached, so aging the row is
  // the faithful clock-robust lever.) Restored in `finally` so later tests read pristine.
  await admin
    .from("receivable")
    .update({ last_payment_date: "2026-01-01" })
    .eq("workspace_id", ws)
    .eq("deal_code", "D021");

  try {
    await signIn(page, email);
    await page.goto("/dashboard");
    const table = page.getByTestId("chase-table");

    await expect(
      table.locator('[data-testid="chase-row"][data-deal="D021"]').getByTestId("chase-follow-up")
    ).toHaveAttribute("data-follow-up", "chase");
    await expect(
      table.locator('[data-testid="chase-row"][data-deal="D013"]').getByTestId("chase-follow-up")
    ).toHaveAttribute("data-follow-up", "no_payment_yet");
  } finally {
    // Restore D021's real release date (workbook: 2026-07-09).
    await admin
      .from("receivable")
      .update({ last_payment_date: "2026-07-09" })
      .eq("workspace_id", ws)
      .eq("deal_code", "D021");
  }
});

test("Section 8 — inline Next Action writes through to the M4 receivable + audit (AC10/AC12)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const ws = await workspaceOf(mainUid);
  const note = "Called CLI — releasing Aug 15";

  await signIn(page, email);
  await page.goto("/dashboard");

  // Edit D013's Next Action inline on the chase list (the module's only write path).
  const table = page.getByTestId("chase-table");
  await table.getByTestId("chase-note-D013").fill(note);
  await table.getByTestId("chase-note-save-D013").click();
  await expect(table.getByTestId("chase-note-status-D013")).toContainText("Saved");

  // Same field on the M4 receivable detail — one source, provably (§DoD).
  await page.goto("/collectibles/D013");
  await expect(page.getByTestId("next-action-note")).toHaveValue(note);

  // The write is audited (old→new) on the receivable.
  const { data: rec } = await admin
    .from("receivable")
    .select("id")
    .eq("workspace_id", ws)
    .eq("deal_code", "D013")
    .single();
  const { data: audits } = await admin
    .from("audit_log_entry")
    .select("action, field_changes")
    .eq("workspace_id", ws)
    .eq("entity_type", "receivable")
    .eq("entity_id", (rec as { id: string }).id);
  const noteAudit = (audits ?? []).find(
    (a) => (a.field_changes as Record<string, { new: string }>)?.next_action_note?.new === note
  );
  expect(noteAudit, "an audit entry recording the new note").toBeTruthy();
});

test("Section 8 — a concurrent stale edit is handled gracefully (last write wins, audited)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const ws = await workspaceOf(mainUid);
  const winning = "Dashboard save wins — chasing CLI Fri";

  await signIn(page, email);
  await page.goto("/dashboard");
  const table = page.getByTestId("chase-table");

  // The agent starts typing on the (now stale) chase list… Clear the prior note and
  // type key-by-key (Playwright's synthetic `fill` can race a controlled textarea's
  // re-render and concatenate; real key events don't), asserting the pre-save value.
  const editor = table.getByTestId("chase-note-D013");
  await editor.click();
  await editor.clear();
  await expect(editor).toHaveValue("");
  await editor.pressSequentially(winning);
  await expect(editor).toHaveValue(winning);
  // …while another surface writes a different note to the SAME receivable first.
  await admin
    .from("receivable")
    .update({ next_action_note: "Detail view edited this meanwhile" })
    .eq("workspace_id", ws)
    .eq("deal_code", "D013");

  // Saving the stale edit still lands — no crash — and converges (last write wins).
  await table.getByTestId("chase-note-save-D013").click();
  await expect(table.getByTestId("chase-note-status-D013")).toContainText("Saved");

  // A fresh read of the dynamic dashboard shows the winning note (wait for the
  // section to render first, so the value check never races a cold route compile).
  await page.goto("/dashboard");
  await expect(page.getByTestId("section-chase")).toBeVisible();
  await expect(page.getByTestId("chase-table").getByTestId("chase-note-D013")).toHaveValue(winning);

  // And the audited trail recorded the converging write.
  const { data: rec } = await admin
    .from("receivable")
    .select("id, next_action_note")
    .eq("workspace_id", ws)
    .eq("deal_code", "D013")
    .single();
  expect((rec as { next_action_note: string }).next_action_note).toBe(winning);
});

test("Section 8 — a chase row drills to the receivable detail (FR-M6-12)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/dashboard");

  await page.getByTestId("chase-table").getByTestId("chase-deal-link-D016").click();
  await expect(page).toHaveURL(/\/collectibles\/D016/, { timeout: 30000 });
  await expect(page.getByTestId("next-action-note")).toBeVisible();
});

test("Section 8 — 360px chase-first: jump link, card stack, thumb-edit a note, console clean", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, email);
  await page.goto("/dashboard");

  // The mobile chase-first jump lands on the chase section; the card stack renders.
  await expect(page.getByTestId("chase-jump")).toBeVisible();
  await page.getByTestId("chase-jump").click();
  await expect(page.getByTestId("chase-cards")).toBeVisible();
  await expect(page.locator('[data-testid="chase-card"]')).toHaveCount(14);

  // Thumb-edit a Next Action on the mobile surface — the field-use case.
  const cards = page.getByTestId("chase-cards");
  await cards.getByTestId("chase-note-D005").fill("Mobile follow-up: SMS the AR desk");
  await cards.getByTestId("chase-note-save-D005").click();
  await expect(cards.getByTestId("chase-note-status-D005")).toContainText("Saved");

  // No horizontal overflow of the page body (the 360px requirement).
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(noOverflow).toBe(true);
  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
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

test("Section 7 — Data Health FIRES on constructed cases + tolerance boundary (AC8/AC9)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  // This test MUTATES the workspace, so it runs last among the data-user tests
  // (serial mode = declaration order); the rendering/drill-down asserts above all
  // read the pristine import. Constructs each check the way the M6.1 live-check
  // does — direct RLS-bypassing admin writes on the stored balance/variance columns.
  const ws = await workspaceOf(mainUid);

  // (b) fully-paid-open: an Open receivable paid to exactly its collectible.
  await admin
    .from("receivable")
    .update({ collected_net: "126500.00", balance: "0.00" })
    .eq("workspace_id", ws)
    .eq("deal_code", "D002");
  // (c) tolerance boundary — exactly −0.50 must NOT fire (|−0.50| > 0.50 is false).
  await admin
    .from("receivable")
    .update({ variance: "-0.50" })
    .eq("workspace_id", ws)
    .eq("deal_code", "D001");
  // (d) referral owed: flip D004's imported Paid=Yes to unpaid.
  await admin
    .from("deal")
    .update({ referral_paid: false })
    .eq("workspace_id", ws)
    .eq("deal_code", "D004");

  await signIn(page, email);
  await page.goto("/dashboard");

  // (b) fires with a count and a drill-down to exactly the flagged receivable.
  await expect(page.getByTestId("health-check-b")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("health-count-b")).toHaveText("1");
  // (c) at the −0.50 boundary stays ✓ (does not fire).
  await expect(page.getByTestId("health-check-c")).toHaveAttribute("data-ok", "true");
  // (d) fires.
  await expect(page.getByTestId("health-check-d")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("health-count-d")).toHaveText("1");
  // Not everything is clear now — the all-clear banner is gone.
  await expect(page.getByTestId("data-health-all-clear")).toHaveCount(0);

  // Drill (b) → open receivables paid in full/over; lands on exactly D002.
  await page.getByTestId("health-link-b").click();
  await expect(page).toHaveURL(/\/collectibles\?.*overpaid=true/, { timeout: 30000 });
  await expect(page.getByTestId("overpaid-only")).toBeChecked();
  await expect(page.getByTestId("result-count")).toContainText("1 receivable");
  await expect(page.locator('[data-testid="receivable-row"]')).toContainText("D002");

  // Push the closed variance one centavo past tolerance: −0.51 now FIRES (AC9).
  await admin
    .from("receivable")
    .update({ variance: "-0.51" })
    .eq("workspace_id", ws)
    .eq("deal_code", "D001");
  await page.goto("/dashboard");
  await expect(page.getByTestId("health-check-c")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("health-count-c")).toHaveText("1");

  // Drill (c) → closed receivables over tolerance; lands on exactly D001.
  await page.getByTestId("health-link-c").click();
  await expect(page).toHaveURL(/\/collectibles\?.*variance=over-tolerance/, { timeout: 30000 });
  await expect(page.getByTestId("variance-over-tolerance")).toBeChecked();
  await expect(page.locator('[data-testid="receivable-row"]')).toContainText("D001");
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
  // Section 8's positive empty state — nothing owed, nothing to chase (rule 19).
  await expect(page.getByTestId("chase-empty")).toBeVisible();
  await expect(page.getByTestId("chase-empty")).toContainText("Nothing to chase");
});
