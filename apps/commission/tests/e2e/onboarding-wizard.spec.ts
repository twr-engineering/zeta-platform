import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M10.2 — the first-run wizard, end to end through the real UI (FR-M10-01/08).
 *
 * The wizard's whole point is a FRESH workspace, so each test provisions its own
 * throwaway signup via the admin API and drives the real confirmation link —
 * which lands the new owner in the wizard (that redirect is the "auto-opened
 * once" of FR-M10-01). Users are deleted afterwards: delta-residue zero, the
 * real account untouched. The wizard EMBEDS the real M0/M1 flows, so this also
 * exercises the tax-settings form, the seed offer and the importer inline.
 */

test.describe.configure({ mode: "serial" });

const FIXTURE = path.resolve(__dirname, "../fixtures/synthetic-workbook.xlsx");

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

const PASSWORD = "throwaway-onboarding-e2e-pw";
const created: string[] = [];

test.afterAll(async () => {
  for (const uid of created) await admin.auth.admin.deleteUser(uid);
});

/**
 * Sign up a fresh user and follow the confirmation link — which, for a signup,
 * lands on the wizard (FR-M10-01). Uses admin.generateLink so no real email is
 * sent (the built-in SMTP is rate-limited — M0.1's standing note).
 */
async function signUpToWizard(page: Page, displayName: string): Promise<void> {
  const email = `onboarding-e2e-${Date.now()}-${Math.floor(performance.now())}@throwaway.test`;
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
  // Let the mount-time open_onboarding transition (not_started → in_progress)
  // settle before the test drives steps, so the continueStep barriers below only
  // ever catch advance responses, never the open one.
  await page.waitForLoadState("networkidle");
}

/**
 * Click "Continue" and wait for the advance_onboarding server action to COMMIT
 * before returning — the transition is fire-and-forget (optimistic local step),
 * so a test that reloads/navigates immediately would race the persistence.
 * Server actions POST back to the current route (/onboarding).
 */
async function continueStep(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/onboarding"),
    ),
    page.getByTestId("onboarding-continue").click(),
  ]);
}

test("fresh signup lands in the wizard; the fresh-start path completes", async ({ page }) => {
  await signUpToWizard(page, "Zeta Owner");

  // Step 1 — basics: rename, the flow map, the P0 philosophy verbatim.
  await expect(page.getByTestId("onboarding-step-basics")).toBeVisible();
  await expect(page.getByTestId("onboarding-flow-map")).toBeVisible();
  await expect(page.getByTestId("philosophy-interstitial")).toContainText(
    "cash actually collected = balance left"
  );
  await page.getByTestId("workspace-name-input").fill("Zeta Group");
  await page.getByTestId("rename-workspace-button").click();
  await expect(page.getByTestId("form-message")).toContainText(/renamed/i);

  await continueStep(page);

  // Step 2 — tax review: the P11 EWT-5% callout, and the VAT question stamps.
  await expect(page.getByTestId("onboarding-step-tax")).toBeVisible();
  await expect(page.getByTestId("ewt-5-callout")).toContainText("5%");
  await expect(page.getByTestId("vat-unconfirmed-notice")).toBeVisible();
  await page.getByTestId("confirm-vat-registration-checkbox").click();
  await page.getByTestId("save-tax-settings-button").click();
  // The banner is gone once the answer is stamped (vat_registered_confirmed_at).
  await expect(page.getByTestId("vat-confirmed-note")).toBeVisible();
  await expect(page.getByTestId("vat-unconfirmed-notice")).toHaveCount(0);

  await continueStep(page);

  // Step 3 — seed lists: accept the first offered set; it flips to "already set up".
  await expect(page.getByTestId("onboarding-step-seed")).toBeVisible();
  await page.getByTestId("seed-accept").first().click();
  await expect(page.getByText(/already set up/i).first()).toBeVisible();

  await continueStep(page);

  // Step 4 — the fork: philosophy shown before the choice; "Start fresh" advances.
  await expect(page.getByTestId("onboarding-step-fork")).toBeVisible();
  await expect(page.getByTestId("philosophy-before-fork")).toBeVisible();
  await expect(page.getByTestId("fork-import")).toBeVisible();
  await page.getByTestId("fork-fresh-button").click();

  // Step 5 — the M10.3 walkthrough intro; skipping it finishes setup.
  await expect(page.getByTestId("walkthrough-intro")).toBeVisible();
  await page.getByTestId("walkthrough-skip").click();
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();
});

test("dismiss mid-wizard leaves the app usable; Settings re-entry resumes at the same step", async ({
  page,
}) => {
  await signUpToWizard(page, "Dismisser");

  // Move to step 2, then dismiss.
  await continueStep(page);
  await expect(page.getByTestId("onboarding-step-tax")).toBeVisible();

  await page.getByTestId("onboarding-dismiss").click();
  await page.getByTestId("onboarding-dismiss-confirm-button").click();

  // The app is fully usable — we land on a working dashboard, no resume prompt
  // (dismissed ≠ in progress), and nothing is gated.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByTestId("onboarding-resume-prompt")).toHaveCount(0);

  // Settings → Setup assistant re-opens the wizard AT the step we left (rule 7).
  await page.goto("/settings/general");
  await page.getByTestId("settings-setup-assistant").click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByTestId("onboarding-step-tax")).toBeVisible();
});

test("reload mid-wizard resumes at the same step; the dashboard shows the resume prompt", async ({
  page,
}) => {
  await signUpToWizard(page, "Resumer");

  // Advance two steps → seed_lists (step 3 of 5).
  await continueStep(page);
  await expect(page.getByTestId("onboarding-step-tax")).toBeVisible();
  await continueStep(page);
  await expect(page.getByTestId("onboarding-step-seed")).toBeVisible();

  // The dashboard shows the non-modal "Continue setup (step 3 of 5)" prompt (AC3).
  // This read is a fresh server render, so `expect` retries until current_step
  // has persisted — it doubles as the barrier before the resume assertion below.
  await page.goto("/dashboard");
  const prompt = page.getByTestId("onboarding-resume-prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("step 3 of 5");

  // Re-entering the wizard resumes on the persisted step (rule 2 / reload).
  await page.goto("/onboarding");
  await expect(page.getByTestId("onboarding-step-seed")).toBeVisible();
});

test("import path inside the wizard commits and offers to skip the walkthrough", async ({
  page,
}) => {
  await signUpToWizard(page, "Importer");

  // Skip ahead to the fork.
  await continueStep(page); // → tax
  await continueStep(page); // → seed
  await continueStep(page); // → fork
  await expect(page.getByTestId("onboarding-step-fork")).toBeVisible();

  // Choose import; the real M1.4 importer is embedded inline.
  await page.getByTestId("fork-import-button").click();
  await page.getByTestId("import-file").setInputFiles(FIXTURE);
  await page.getByTestId("import-dry-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible();

  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-done")).toBeVisible();

  // Import success → the wizard offers to skip the sample walkthrough (FR-M10-05).
  await expect(page.getByTestId("import-skip-offer")).toBeVisible();
  await page.getByTestId("import-skip-finish").click();
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();
});

/** Advance basics → tax → seed → fork, then take the fresh-start walkthrough. */
async function reachWalkthrough(page: Page): Promise<void> {
  await continueStep(page); // basics → tax
  await continueStep(page); // tax → seed
  await continueStep(page); // seed → fork
  await expect(page.getByTestId("onboarding-step-fork")).toBeVisible();
  await page.getByTestId("fork-fresh-button").click();
  await expect(page.getByTestId("walkthrough-intro")).toBeVisible();
}

test("M10.3 — typed-along walkthrough books the badged sample (NET GCI ₱354,591.84), logs the release, then cleanup zeroes it", async ({
  page,
}) => {
  await signUpToWizard(page, "Walkthrough Owner");
  await reachWalkthrough(page);

  // Start the guided sample — ensures the D021 reference items, mounts the REAL
  // deal form prefilled with D021 + the coach-marks overlay.
  await page.getByTestId("walkthrough-start").click();
  await expect(page.getByTestId("walkthrough-form")).toBeVisible();
  // The coach-mark card (the wrapper is a zero-box overlay host, so assert the card).
  await expect(page.getByTestId("coach-mark")).toBeVisible();

  // The live computed panel (M1's engine) shows D021's NET GCI (AC2).
  await expect(page.getByTestId("computed-net-gci")).toContainText("354,591.84");

  // Dismiss the coach-marks and save the sample deal.
  await page.getByTestId("coach-skip").click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("deal-submit").click(),
  ]);

  // The sample saved — the walkthrough moves to the optional payment leg, badged.
  await expect(page.getByTestId("walkthrough-payment")).toBeVisible();
  await expect(page.getByTestId("walkthrough-saved-note").getByTestId("sample-badge")).toBeVisible();

  // The live split (M5's engine) — Net Cash ₱45,535.71 — then log it.
  await expect(page.getByTestId("sample-split-net-cash")).toContainText("45,535.71");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("sample-payment-submit").click(),
  ]);

  // Keep the sample and finish → the SAMPLE badge + persistent banner show across
  // surfaces (rule 4).
  await expect(page.getByTestId("walkthrough-cleanup")).toBeVisible();
  await page.getByTestId("cleanup-keep").click();
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();

  await page.goto("/deals");
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  await expect(page.getByTestId("deal-row").first().getByTestId("sample-badge")).toBeVisible();

  await page.goto("/collectibles");
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  await expect(page.getByTestId("receivable-row").first().getByTestId("sample-badge")).toBeVisible();

  // The checklist card: settings/first-deal/first-payment are NOT ticked by sample
  // records (rule 10) — the sample deal and its release don't count.
  await page.goto("/dashboard");
  await expect(page.getByTestId("checklist-card")).toBeVisible();
  await expect(page.getByTestId("checklist-item-first_deal")).toHaveAttribute("data-done", "false");
  await expect(page.getByTestId("checklist-item-first_payment")).toHaveAttribute("data-done", "false");

  // Remove sample data from the banner → one-transaction cascade; badge + banner
  // gone, dashboards back to zero (AC2).
  await page.getByTestId("sample-banner-remove").click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("sample-banner-confirm").click(),
  ]);
  await expect(page.getByTestId("sample-banner")).toHaveCount(0);

  await page.goto("/deals");
  await expect(page.getByTestId("sample-banner")).toHaveCount(0);
  await expect(page.getByTestId("sample-badge")).toHaveCount(0);
});

test("M10.3 — the checklist is event-driven and dismissible; a dismissal sticks", async ({
  page,
}) => {
  await signUpToWizard(page, "Checklist Owner");
  // Dismiss the wizard so we're on a plain dashboard with the checklist card.
  await page.getByTestId("onboarding-dismiss").click();
  await page.getByTestId("onboarding-dismiss-confirm-button").click();
  await expect(page).toHaveURL(/\/dashboard/);

  const card = page.getByTestId("checklist-card");
  await expect(card).toBeVisible();
  // Nothing done yet on a fresh, wizard-dismissed workspace.
  await expect(page.getByTestId("checklist-item-first_deal")).toHaveAttribute("data-done", "false");

  // Dismiss it — hidden immediately, and it STAYS hidden across a reload (persisted).
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByTestId("checklist-dismiss").click(),
  ]);
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("checklist-card")).toHaveCount(0);
});
