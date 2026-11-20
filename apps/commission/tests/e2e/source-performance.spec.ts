import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M7.2 — the Source Performance screen, end to end (M7 §9 AC 1–3, 8–9 + the source
 * drill-through). Provisions its OWN throwaway users, imports the REAL v30.20 workbook
 * through the UI so the 21 deals + 8 payments exist and the receivables roll up, then
 * drives /source-performance.
 *
 * CLOCK-ROBUST. M7 is a booked-basis read model with no clock. The 21 fixtures are all
 * booked 2026, so `?year=all` shows the full data regardless of the machine's year, and
 * Year=2026 must equal Year=All (AC2 — proving the filter compares BOOKING year). Skips
 * cleanly when the real workbook is absent; deletes its users after.
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

const PASSWORD = "throwaway-m72-pw";

async function makeUser(tag: string): Promise<{ uid: string; email: string }> {
  const email = `m72-${tag}-${Date.now()}@throwaway.test`;
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

/** The main user's workspace id (RLS-bypassing admin read, for lifecycle setup). */
async function mainWorkspaceId(): Promise<string> {
  const { data } = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", mainUid)
    .single();
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

/** The source row whose visible label contains `name` (unique per source). */
function sourceRow(page: Page, name: string) {
  return page.getByTestId("source-row").filter({ hasText: name });
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

test("table reproduces the §9 fixtures incl. Referral 109.38% pass-through (AC1/AC3)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/source-performance?year=all");

  // YouTube — 7 deals / ₱2,455,541.29 / 36.71% / ₱397,142.86 collected / 16.17% / ₱2,058,398.43 out.
  const yt = sourceRow(page, "YouTube");
  await expect(yt.getByTestId("sp-deals")).toHaveText("7");
  await expect(yt.getByTestId("sp-booked")).toContainText("2,455,541.29");
  await expect(yt.getByTestId("sp-pct")).toContainText("36.71%");
  await expect(yt.getByTestId("sp-collected")).toContainText("397,142.86");
  await expect(yt.getByTestId("sp-pct-collected")).toContainText("16.17%");
  await expect(yt.getByTestId("sp-outstanding")).toContainText("2,058,398.43");
  await expect(yt.getByTestId("sp-dev-gci")).toContainText("2,103,041.29");

  // Repeat Client — 9 deals, R+R Outstanding ₱1,099,000.00, Developer ₱317,414.70.
  const repeat = sourceRow(page, "Repeat Client");
  await expect(repeat.getByTestId("sp-deals")).toHaveText("9");
  await expect(repeat.getByTestId("sp-collected")).toContainText("200,000.00");
  await expect(repeat.getByTestId("sp-rr-out")).toContainText("1,099,000.00");
  await expect(repeat.getByTestId("sp-dev-gci")).toContainText("317,414.70");

  // Referral — the OQ1 anchor: Collected ₱875,000.00 (Σ collected, NOT the sheet's
  // 800,000), % Collected 109.38%, with the pass-through tooltip glyph (§4 rule 8).
  const referral = sourceRow(page, "Referral");
  await expect(referral.getByTestId("sp-collected")).toContainText("875,000.00");
  await expect(referral.getByTestId("sp-pct-collected")).toContainText("109.38%");
  await expect(referral.getByTestId("sp-pct-collected-passthrough")).toBeVisible();

  // TOTAL ties to M6/M2 (§8): Booked 6,688,497.25 / Collected 1,908,192.86 / Outstanding 4,855,304.39.
  await expect(page.getByTestId("total-deals")).toHaveText("21");
  await expect(page.getByTestId("total-booked")).toContainText("6,688,497.25");
  await expect(page.getByTestId("total-collected")).toContainText("1,908,192.86");
  await expect(page.getByTestId("total-pct-collected")).toContainText("28.53%");
  await expect(page.getByTestId("total-outstanding")).toContainText("4,855,304.39");
  await expect(page.getByTestId("total-rr-gci")).toContainText("2,887,550.00");
  await expect(page.getByTestId("total-dev-gci")).toContainText("3,800,947.25");
});

test("default sort is Booked NET GCI descending (§4 rule 10)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/source-performance?year=all");

  // The first source row is YouTube (₱2,455,541.29 — the largest booked).
  await expect(page.getByTestId("source-row").first()).toContainText("YouTube");
  // Sorting Collected descending moves Referral (₱875,000) above lower-collected sources.
  await page.getByTestId("sort-collected").click();
  await expect(page.getByTestId("source-row").first()).toContainText("Referral");
});

test("year filter: All ≡ 2026, dropdown lists only years with deals (AC2/AC8)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);

  // 2026 equals All for this data — proving the filter compares booking year.
  await page.goto("/source-performance?year=2026");
  await expect(page.getByTestId("total-booked")).toContainText("6,688,497.25");
  await expect(sourceRow(page, "YouTube").getByTestId("sp-deals")).toHaveText("7");

  // The dropdown offers exactly All + 2026 (never a year with no booked deal).
  const options = page.getByTestId("source-year-filter").locator("option");
  await expect(options).toHaveText(["All years", "2026"]);

  // The blue select drives the URL; All is the default → clean URL.
  await page.goto("/source-performance?year=2026");
  await page.getByTestId("source-year-filter").selectOption("all");
  await expect(page).toHaveURL(/\/source-performance$/);
  await expect(page.getByTestId("total-booked")).toContainText("6,688,497.25");
});

test("source drill-through lands on exactly that source's deals (FR-M7-09)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/source-performance?year=all");

  // YouTube (7 deals) → the deal list filtered to that lead source.
  await sourceRow(page, "YouTube").getByTestId("sp-source-link").click();
  await expect(page).toHaveURL(/\/deals\?source=/);
  await expect(page.getByTestId("source-filter-chip")).toContainText("YouTube");
  await expect(page.getByTestId("result-count")).toContainText("7 deals");
});

test("CSV/XLSX export matches the screen incl. the year param (AC9)", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, email);
  await page.goto("/source-performance?year=all");

  // CSV over the same auth context — headers, the Referral pass-through %, and the
  // TOTAL row's ties to M6/M2, all to the centavo.
  const csv = await page.request.get("/api/export/source-performance?format=csv&year=all");
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Booked NET GCI");
  expect(text).toContain("109.38%"); // Referral pass-through, uncapped
  expect(text).toContain("6688497.25"); // TOTAL booked (= M2 all-ops GCI)
  expect(text).toContain("1908192.86"); // TOTAL collected (= M6)
  expect(text).toContain("4855304.39"); // TOTAL outstanding (= M6 Balance Outstanding)
  expect(text).toContain("TOTAL");

  // The year param rides along (2026 ≡ All here — same figures, proving it is honoured).
  const csv2026 = await page.request.get("/api/export/source-performance?format=csv&year=2026");
  expect(csv2026.status()).toBe(200);
  expect(await csv2026.text()).toContain("6688497.25");

  // XLSX downloads with the spreadsheet content type.
  const xlsx = await page.request.get("/api/export/source-performance?format=xlsx&year=all");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("an archived source with deals stays visible, badged '(inactive)' (edge case 18)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const wsId = await mainWorkspaceId();
  const { data: lamudi } = await admin
    .from("lead_source")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("name", "Lamudi")
    .single();
  const lamudiId = (lamudi as { id: string }).id;

  // Archive Lamudi (it has 2 deals) — the report must keep the row, labelled "(inactive)".
  await admin.from("lead_source").update({ archived_at: new Date().toISOString() }).eq("id", lamudiId);
  try {
    await signIn(page, email);
    await page.goto("/source-performance?year=all");
    const lamudiRow = sourceRow(page, "Lamudi");
    await expect(lamudiRow).toContainText("(inactive)");
    await expect(lamudiRow.getByTestId("sp-inactive-badge")).toBeVisible();
    // Figures unchanged — archiving the source never drops a deal's NET GCI (edge 18).
    await expect(lamudiRow.getByTestId("sp-deals")).toHaveText("2");
    await expect(lamudiRow.getByTestId("sp-booked")).toContainText("863,003.13");
    // TOTAL still ties to M6/M2.
    await expect(page.getByTestId("total-booked")).toContainText("6,688,497.25");
  } finally {
    // Restore — leave the fixture pristine for any later spec.
    await admin.from("lead_source").update({ archived_at: null }).eq("id", lamudiId);
  }

  await page.goto("/source-performance?year=all");
  await expect(sourceRow(page, "Lamudi")).not.toContainText("(inactive)");
});

test("a source rename propagates to the row label on reload (edge case 18)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  const wsId = await mainWorkspaceId();
  const { data: youtube } = await admin
    .from("lead_source")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("name", "YouTube")
    .single();
  const youtubeId = (youtube as { id: string }).id;

  // Rename YouTube → "YouTube Organic" in M0. The report stores lead_source_id (FK),
  // never the name — the same 7 deals / ₱2,455,541.29 must reappear under the new
  // label on the next read, as one continuous row with no orphaned "YouTube" bucket.
  await admin.from("lead_source").update({ name: "YouTube Organic" }).eq("id", youtubeId);
  try {
    await signIn(page, email);
    await page.goto("/source-performance?year=all");
    const renamed = sourceRow(page, "YouTube Organic");
    await expect(renamed.getByTestId("sp-deals")).toHaveText("7");
    await expect(renamed.getByTestId("sp-booked")).toContainText("2,455,541.29");
    // No leftover "YouTube" row, and the TOTAL still ties to M6/M2 (no NET GCI lost).
    await expect(page.getByTestId("source-row").filter({ hasText: /^YouTube$/ })).toHaveCount(0);
    await expect(page.getByTestId("total-booked")).toContainText("6,688,497.25");
  } finally {
    // Restore — leave the fixture pristine for any later spec.
    await admin.from("lead_source").update({ name: "YouTube" }).eq("id", youtubeId);
  }

  await page.goto("/source-performance?year=all");
  await expect(sourceRow(page, "YouTube").getByTestId("sp-deals")).toHaveText("7");
});

test("empty workspace shows the 'no lead sources configured' state (§4 rule 6)", async ({
  page,
}) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");
  await signIn(page, emptyEmail);
  await page.goto("/source-performance");
  // A fresh workspace has no lead sources yet (they are offered in Settings, not
  // auto-seeded) and no deals → the "configure lead sources" empty state, never a table.
  await expect(page.getByText("No lead sources configured")).toBeVisible();
  await expect(page.getByTestId("source-table")).toHaveCount(0);
});

test("360px: per-source cards, no horizontal overflow, console clean", async ({ page }) => {
  test.skip(!HAVE_WORKBOOK, "real workbook not present");

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, email);
  await page.goto("/source-performance?year=all");

  // The desktop table is hidden; per-source cards + a TOTAL card render.
  await expect(page.getByTestId("source-cards")).toBeVisible();
  await expect(page.getByTestId("source-card").first()).toContainText("YouTube");
  await expect(page.getByTestId("total-card")).toContainText("6,688,497.25");

  // No horizontal body overflow at 360px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);

  // Tolerate only the two documented cosmetic warnings; no real errors.
  const real = errors.filter(
    (e) => !/Download the React DevTools|hydrat/i.test(e)
  );
  expect(real).toEqual([]);
});
