import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M10.5 — AC 1, the full new-user IMPORT journey, end to end in CI (PRD §9.1,
 * FR-M10-01/08, NFR "wizard completable in < 10 min including a workbook import").
 *
 * This is the scripted journey the PRD's acceptance anchor names: a fresh user
 * signs up, walks the whole wizard, imports the REAL v30.20 workbook at the fork,
 * and lands on the M6 dashboard showing the sheet's own totals to the centavo.
 * It is the end-to-end proof that M10 renders M1's engine unaltered.
 *
 * Self-provisioned throwaway user (admin generateLink → confirm link lands in the
 * wizard, FR-M10-01), deleted afterwards → delta-residue zero, the real account
 * untouched. The journey is SERIAL and single — the timing NFR is measured on the
 * one continuous run, not an average.
 *
 * Timing (FR-M10-18 / NFR): wall-clock is captured at the wizard landing and again
 * when the dashboard anchors are on screen, asserted < 10 min, and reported both to
 * the console and as a test annotation so the CI run carries the measured number.
 */

test.describe.configure({ mode: "serial" });

const REAL_WORKBOOK = path.resolve(
  __dirname,
  "../../../discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx",
);

/** The <10-minute wizard NFR, in milliseconds (PRD §8 / AC1 "Elapsed time < 10 min"). */
const WIZARD_BUDGET_MS = 10 * 60 * 1000;

function env(): Record<string, string> {
  const raw = readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8");
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
  { db: { schema: "commission" }, auth: { persistSession: false } },
);

const PASSWORD = "throwaway-import-journey-pw";
const created: string[] = [];

test.afterAll(async () => {
  for (const uid of created) await admin.auth.admin.deleteUser(uid);
});

/** Sign up a fresh owner and follow the confirmation link into the wizard. */
async function signUpToWizard(page: Page): Promise<void> {
  const email = `import-journey-${Date.now()}-${Math.floor(performance.now())}@throwaway.test`;
  const link = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: PASSWORD,
    options: { data: { display_name: "Import Owner" } },
  });
  if (link.error) throw link.error;
  created.push(link.data.user!.id);

  const tokenHash = link.data.properties!.hashed_token;
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=signup`);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByTestId("onboarding-wizard")).toBeVisible();
  // Let the mount-time open transition settle so the continueStep barriers below
  // only ever catch advance responses, never the open one.
  await page.waitForLoadState("networkidle");
}

/** Click Continue and wait for the advance_onboarding POST to commit before returning. */
async function continueStep(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/onboarding"),
    ),
    page.getByTestId("onboarding-continue").click(),
  ]);
}

test("AC1 — sign up → wizard → import the v30.20 workbook → dashboard ties to the sheet, < 10 min", async ({
  page,
}, testInfo) => {
  test.skip(
    !existsSync(REAL_WORKBOOK),
    "real v30.20 workbook not present in discovery/source — the anchor journey needs it",
  );
  // The importer + eight-section dashboard read is the slow leg; give the whole
  // journey headroom over the 30 s default so a cold route compile never masquerades
  // as a real failure. The <10-min NFR is asserted explicitly below, not via timeout.
  test.setTimeout(WIZARD_BUDGET_MS + 2 * 60 * 1000);

  await signUpToWizard(page);
  const started = performance.now(); // wizard is open → the clock the NFR measures

  // ---- Step 1 · basics — name the workspace "Zeta Group" (AC1). ----
  await expect(page.getByTestId("onboarding-step-basics")).toBeVisible();
  await page.getByTestId("workspace-name-input").fill("Zeta Group");
  await page.getByTestId("rename-workspace-button").click();
  await expect(page.getByTestId("form-message")).toContainText(/renamed/i);
  await continueStep(page);

  // ---- Step 2 · tax review — the P11 EWT explainer + confirm VAT (12/10/3.6M/3). ----
  await expect(page.getByTestId("onboarding-step-tax")).toBeVisible();
  await expect(page.getByTestId("ewt-5-callout")).toContainText("5%");
  await page.getByTestId("confirm-vat-registration-checkbox").click();
  await page.getByTestId("save-tax-settings-button").click();
  await expect(page.getByTestId("vat-confirmed-note")).toBeVisible();
  await continueStep(page);

  // ---- Step 3 · seed — accept Property Types, SKIP Developers (the importer brings mine). ----
  await expect(page.getByTestId("onboarding-step-seed")).toBeVisible();
  // The first offer is Property Types; accept only it, then continue (developers
  // stay unseeded so the import brings the workbook's own).
  await page.getByTestId("seed-accept").first().click();
  await expect(page.getByText(/already set up/i).first()).toBeVisible();
  await continueStep(page);

  // ---- Step 4 · fork — choose Import; the real M1.4 importer runs inline. ----
  await expect(page.getByTestId("onboarding-step-fork")).toBeVisible();
  await page.getByTestId("fork-import-button").click();
  await page.getByTestId("import-file").setInputFiles(REAL_WORKBOOK);
  await page.getByTestId("import-dry-run").click();

  // Dry-run summary: the §9 anchors + 0 mismatches (the confirm block only renders
  // when mismatches === 0), and the 21-deal / 8-payment counts (AC1).
  const summary = page.getByTestId("import-summary");
  await expect(summary).toBeVisible();
  await expect(page.getByTestId("import-reconciliation")).toContainText("within ₱0.01");
  await expect(summary).toContainText("6,763,497.25");
  await expect(summary).toContainText("1,908,192.86");
  await expect(page.getByText(/all 21 deals, 8 payments/)).toBeVisible(); // 0 mismatches ⇒ confirm block

  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-done")).toBeVisible();
  await expect(page.getByTestId("import-done")).toContainText("21 deals");

  // Import success → the wizard offers to skip the walkthrough (data exists, FR-M10-05).
  await expect(page.getByTestId("import-skip-offer")).toBeVisible();
  await page.getByTestId("import-skip-finish").click();
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();

  // ---- Land on the dashboard and assert the sheet's own totals to the centavo. ----
  await page.goto("/dashboard");
  await expect(page.getByTestId("tile-total-collectible-value")).toHaveText("₱ 6,763,497.25");
  await expect(page.getByTestId("tile-total-collected-value")).toHaveText("₱ 1,908,192.86");
  await expect(page.getByTestId("tile-balance-outstanding-value")).toHaveText("₱ 4,855,304.39");

  // ---- STOP THE CLOCK: the acceptance anchor (dashboard ties) is on screen. ----
  const elapsedMs = performance.now() - started;
  const elapsed = `${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / 60000).toFixed(2)} min)`;
  testInfo.annotations.push({ type: "wizard-import-elapsed", description: elapsed });
  console.log(`  AC1 import journey — wizard→dashboard anchors: ${elapsed} (budget < 10 min)`);
  expect(elapsedMs, `wizard-with-import must complete under 10 min (was ${elapsed})`).toBeLessThan(
    WIZARD_BUDGET_MS,
  );

  // ---- The checklist: settings ✓ + importer ✓, and first deal / first payment ✓
  //      because the imported records are REAL (rule 10 only excludes samples). ----
  await expect(page.getByTestId("checklist-item-settings_reviewed")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("checklist-item-importer_run")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("checklist-item-first_deal")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("checklist-item-first_payment")).toHaveAttribute("data-done", "true");

  // ---- D021's ledger figures — Collected ₱44,642.86 / Balance ₱309,948.98 (AC1). ----
  await page.goto("/collectibles/D021");
  await expect(page.getByTestId("detail-balance")).toContainText("309,948.98");
  await expect(page.getByTestId("payment-history")).toContainText("44,642.86");
});
