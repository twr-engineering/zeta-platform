import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M10.5 — AC 2, the fresh-start JOURNEY, end to end in CI (PRD §9.2, FR-M10-07),
 * plus the AC 12 mobile variant at 360 px (PRD rule 13).
 *
 * A fresh user picks "Start fresh", does the typed-along walkthrough on D021's
 * inputs (the computed panel — M1's engine — shows NET GCI ₱354,591.84), logs the
 * optional ₱50,000 sample release (M5's split → Net Cash ₱45,535.71), keeps the
 * badged sample, then removes it — one transaction, dashboards back to zero — and
 * finally logs their FIRST REAL deal, which DOES tick the checklist (rule 10 only
 * spares samples).
 *
 * Self-provisioned throwaway user (deleted afterwards → delta-residue zero). Timing
 * is captured wizard-open → complete and asserted < 10 min (the fresh path has no
 * import, so it is comfortably inside budget; the number is still reported).
 */

test.describe.configure({ mode: "serial" });

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

const PASSWORD = "throwaway-fresh-journey-pw";
const created: string[] = [];

test.afterAll(async () => {
  for (const uid of created) await admin.auth.admin.deleteUser(uid);
});

async function signUpToWizard(page: Page, displayName: string): Promise<void> {
  const email = `fresh-journey-${Date.now()}-${Math.floor(performance.now())}@throwaway.test`;
  const link = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: PASSWORD,
    options: { data: { display_name: displayName } },
  });
  if (link.error) throw link.error;
  created.push(link.data.user!.id);

  const tokenHash = link.data.properties!.hashed_token;
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=signup`);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByTestId("onboarding-wizard")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function continueStep(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/onboarding"),
    ),
    page.getByTestId("onboarding-continue").click(),
  ]);
}

/** Steps 1–4: name → tax → seed → pick "Start fresh" → land on the walkthrough intro. */
async function walkToFreshWalkthrough(page: Page): Promise<void> {
  // Step 1 · basics
  await expect(page.getByTestId("onboarding-step-basics")).toBeVisible();
  await page.getByTestId("workspace-name-input").fill("Zeta Group");
  await page.getByTestId("rename-workspace-button").click();
  await expect(page.getByTestId("form-message")).toContainText(/renamed/i);
  await continueStep(page);

  // Step 2 · tax
  await expect(page.getByTestId("onboarding-step-tax")).toBeVisible();
  await page.getByTestId("confirm-vat-registration-checkbox").click();
  await page.getByTestId("save-tax-settings-button").click();
  await expect(page.getByTestId("vat-confirmed-note")).toBeVisible();
  await continueStep(page);

  // Step 3 · seed lists — accept the offered starting lists.
  await expect(page.getByTestId("onboarding-step-seed")).toBeVisible();
  await page.getByTestId("seed-accept").first().click();
  await expect(page.getByText(/already set up/i).first()).toBeVisible();
  await continueStep(page);

  // Step 4 · fork — start fresh → the walkthrough intro.
  await expect(page.getByTestId("onboarding-step-fork")).toBeVisible();
  await page.getByTestId("fork-fresh-button").click();
  await expect(page.getByTestId("walkthrough-intro")).toBeVisible();
}

test("AC2 — fresh start → typed-along sample (₱354,591.84) + release → keep → remove zeros it → first REAL deal ticks the checklist", async ({
  page,
}, testInfo) => {
  test.setTimeout(WIZARD_BUDGET_MS + 2 * 60 * 1000);

  await signUpToWizard(page, "Fresh Owner");
  const started = performance.now();

  await walkToFreshWalkthrough(page);

  // ---- The typed-along walkthrough: the real deal form, prefilled with D021. ----
  await page.getByTestId("walkthrough-start").click();
  await expect(page.getByTestId("walkthrough-form")).toBeVisible();
  await expect(page.getByTestId("coach-mark")).toBeVisible();

  // The live computed panel (M1's engine, rendered as-is) shows D021's NET GCI.
  await expect(page.getByTestId("computed-net-gci")).toContainText("354,591.84");

  await page.getByTestId("coach-skip").click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("deal-submit").click(),
  ]);

  // ---- The optional sample release: M5's split → Net Cash ₱45,535.71 (badged). ----
  await expect(page.getByTestId("walkthrough-payment")).toBeVisible();
  await expect(
    page.getByTestId("walkthrough-saved-note").getByTestId("sample-badge"),
  ).toBeVisible();
  await expect(page.getByTestId("sample-split-net-cash")).toContainText("45,535.71");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("sample-payment-submit").click(),
  ]);

  // ---- Keep the sample, finish setup → completion screen. ----
  await expect(page.getByTestId("walkthrough-cleanup")).toBeVisible();
  await page.getByTestId("cleanup-keep").click();
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();

  // ---- STOP THE CLOCK: the fresh-start wizard is complete. ----
  const elapsedMs = performance.now() - started;
  const elapsed = `${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / 60000).toFixed(2)} min)`;
  testInfo.annotations.push({ type: "wizard-fresh-elapsed", description: elapsed });
  console.log(`  AC2 fresh-start journey — wizard→complete: ${elapsed} (budget < 10 min)`);
  expect(elapsedMs, `fresh-start wizard must complete under 10 min (was ${elapsed})`).toBeLessThan(
    WIZARD_BUDGET_MS,
  );

  // ---- The badged sample shows across surfaces; rule 10: it does NOT tick first deal. ----
  await page.goto("/deals");
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  await expect(page.getByTestId("deal-row").first().getByTestId("sample-badge")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("checklist-item-first_deal")).toHaveAttribute("data-done", "false");
  await expect(page.getByTestId("checklist-item-first_payment")).toHaveAttribute("data-done", "false");

  // ---- Remove sample data → one transaction; badge + banner gone, dashboards zero (AC2). ----
  await page.goto("/deals");
  await page.getByTestId("sample-banner-remove").click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("sample-banner-confirm").click(),
  ]);
  await expect(page.getByTestId("sample-banner")).toHaveCount(0);
  await expect(page.getByTestId("sample-badge")).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page.getByTestId("tile-total-collectible-value")).toHaveText("₱ 0.00");

  // ---- Now the FIRST REAL deal — a non-sample booking DOES tick the checklist. ----
  await page.goto("/deals/new");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("field-dealType").selectOption("developer");
  await page.getByTestId("field-bookedDate").fill("2026-07-15");
  await page.getByTestId("field-developerId").selectOption({ label: "Abrown Inc." });
  await page.getByTestId("field-clientName").fill("First Real Client");
  await page.getByTestId("field-representation").selectOption("double_ended");
  await page.getByTestId("field-propertyTypeId").selectOption({ label: "House & Lot" });
  await page.getByTestId("field-leadSourceId").selectOption({ label: "YouTube" });
  await page.getByTestId("field-propertyDetails").fill("Real unit — House & Lot");
  await page.getByTestId("field-modeOfPayment").selectOption("bank");
  await page.getByTestId("field-listPrice").fill("8000000");
  await page.getByTestId("field-rate").fill("5");
  await expect(page.getByTestId("computed-net-gci")).toHaveText("₱ 318,877.55"); // no incentive here
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("deal-submit").click(),
  ]);

  // It lands on the ledger with NO sample badge, and the checklist first deal ticks.
  await page.goto("/deals");
  await expect(page.getByTestId("deal-row").filter({ hasText: "First Real Client" })).toBeVisible();
  await expect(page.getByTestId("sample-banner")).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page.getByTestId("checklist-item-first_deal")).toHaveAttribute("data-done", "true");
});

/**
 * AC 12 — the SAME journey at 360 px proves the mobile pass (PRD rule 13): steps
 * render as pages, popovers/coach-marks as bottom sheets, and the whole wizard +
 * typed-along walkthrough is completable. Kept lighter than the desktop journey —
 * it exists to catch a mobile-only reachability regression, not to re-assert every
 * figure — but it still drives the computed panel and books + removes the sample.
 */
test.describe("AC12 — mobile 360px", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("the full wizard + walkthrough is completable at 360px, popovers become bottom sheets", async ({
    page,
  }) => {
    test.setTimeout(WIZARD_BUDGET_MS + 2 * 60 * 1000);
    await signUpToWizard(page, "Mobile Owner");

    // A help popover is a bottom sheet at 360px (rule 13): open the philosophy "?"
    // and assert the sheet surface appears, then dismiss it.
    await page.getByTestId("philosophy-interstitial").getByRole("button").first().click();
    await expect(page.getByTestId("help-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-sheet")).toHaveCount(0);

    await walkToFreshWalkthrough(page);

    // Coach-marks are a bottom sheet at 360px; the computed panel still ties out.
    await page.getByTestId("walkthrough-start").click();
    await expect(page.getByTestId("walkthrough-form")).toBeVisible();
    await expect(page.getByTestId("coach-mark")).toBeVisible();
    await expect(page.getByTestId("computed-net-gci")).toContainText("354,591.84");

    await page.getByTestId("coach-skip").click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByTestId("deal-submit").click(),
    ]);

    // Skip the optional payment and remove the sample from the cleanup step — the
    // whole flow finishes at 360px (AC12).
    await expect(page.getByTestId("walkthrough-payment")).toBeVisible();
    await page.getByTestId("sample-payment-skip").click();
    await expect(page.getByTestId("walkthrough-cleanup")).toBeVisible();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByTestId("cleanup-remove").click(),
    ]);
    await expect(page.getByTestId("onboarding-complete")).toBeVisible();
  });
});
