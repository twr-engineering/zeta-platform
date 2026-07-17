import { test, expect, type Page } from "@playwright/test";

/**
 * M0.2 — Tax settings & audit trail, end to end.
 *
 * Mirrors the milestone's demo script: change EWT 10% → 5% (the
 * sworn-declaration path), show the audit entry `ewt_rate: 0.1000 → 0.0500`
 * with a timestamp, change it back.
 *
 * WHY THIS FILE SIGNS IN AS MARIA, NOT JD
 *
 * Playwright runs test FILES in parallel. auth-workspace.spec.ts asserts JD's
 * tax settings are at the AC1 defaults; this file changes rates. Sharing a
 * fixture would make the two race and fail on timing rather than on behaviour.
 * The v1 schema gives one workspace per user, so a second agent IS the
 * isolation — and agent2 is already seeded for exactly this reason.
 *
 * Requires the dev fixtures (`pnpm run seed:dev`).
 */

/**
 * Serial: every test here mutates the one tax_settings row in Maria's
 * workspace, and the last test restores it. Parallel would interleave the
 * restore with another test's assertion.
 */
test.describe.configure({ mode: "serial" });

const AGENT = { email: "agent2@solo.test", password: "zeta-dev-password" };

/** M0 AC1 — what the signup bootstrap creates, and what this file restores to. */
const DEFAULTS = {
  vat: "12.00",
  ewt: "10.00",
  threshold: "3600000.00",
  chase: "3",
};

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(AGENT.email);
  await page.getByTestId("password-input").fill(AGENT.password);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openTaxSettings(page: Page) {
  await signIn(page);
  await page.goto("/settings/tax");
  await expect(page.getByTestId("vat-rate-input")).toBeVisible();
}

/** Save a money-restating change: the modal, the tick, the confirm. */
async function saveThroughGate(page: Page) {
  await page.getByTestId("save-tax-settings-button").click();
  await expect(page.getByTestId("tax-confirm-gate")).toBeVisible();
  await page.getByTestId("tax-confirm-gate-checkbox").click();
  await page.getByTestId("tax-confirm-gate-confirm").click();
  await expect(page.getByTestId("tax-confirm-gate")).not.toBeVisible();
  await expect(page.getByTestId("form-message")).toBeVisible();
}

test("tax settings render the stored row, and Save is idle until something changes", async ({
  page,
}) => {
  await openTaxSettings(page);

  await expect(page.getByTestId("vat-rate-input")).toHaveValue(DEFAULTS.vat);
  await expect(page.getByTestId("ewt-rate-input")).toHaveValue(DEFAULTS.ewt);
  await expect(page.getByTestId("property-vat-threshold-input")).toHaveValue(
    DEFAULTS.threshold
  );
  await expect(page.getByTestId("chase-idle-months-input")).toHaveValue(
    DEFAULTS.chase
  );
  await expect(page.getByTestId("save-tax-settings-button")).toBeDisabled();
});

test("a rate change asks first, and cancelling writes nothing (AC10)", async ({
  page,
}) => {
  await signIn(page);

  // A DELTA, not an absolute count: this file's last test restores the fixture
  // by writing more entries, so a second run of the suite starts with a
  // non-empty trail. Asserting zero would pass exactly once.
  await page.goto("/settings/audit-log");
  const entriesBefore = await page.getByTestId("audit-entry").count();

  await page.goto("/settings/tax");
  await expect(page.getByTestId("ewt-rate-input")).toBeVisible();

  await page.getByTestId("ewt-rate-input").fill("5");
  await page.getByTestId("save-tax-settings-button").click();

  const gate = page.getByTestId("tax-confirm-gate");
  await expect(gate).toBeVisible();
  // The consequence is stated, not implied (M0 rule 3 / §6).
  await expect(page.getByTestId("tax-confirm-gate-consequence")).toContainText(
    "restates money"
  );
  // Nothing is confirmable until the agent actually acknowledges.
  await expect(page.getByTestId("tax-confirm-gate-confirm")).toBeDisabled();

  await page.getByTestId("tax-confirm-gate-cancel").click();
  await expect(gate).not.toBeVisible();

  // AC10: "nothing recomputes and no audit entry is written". The reload is the
  // assertion — it re-reads the database rather than trusting React state.
  await page.reload();
  await expect(page.getByTestId("ewt-rate-input")).toHaveValue(DEFAULTS.ewt);

  await page.goto("/settings/audit-log");
  await expect(page.getByTestId("audit-entry")).toHaveCount(entriesBefore);
});

test("EWT 10% → 5%: the sworn-declaration path, audited (demo script)", async ({
  page,
}) => {
  await openTaxSettings(page);

  await page.getByTestId("ewt-rate-input").fill("5");
  await saveThroughGate(page);

  // Reached the database, not just React state.
  await page.reload();
  await expect(page.getByTestId("ewt-rate-input")).toHaveValue("5.00");

  await page.goto("/settings/audit-log");
  const entry = page.getByTestId("audit-entry").first();
  await expect(entry).toContainText("Tax Settings");
  await expect(entry).toContainText("Expanded withholding tax (EWT)");
  // The STORED decimals, exactly as the milestone's demo script asks to see
  // them. "5%" rendering as 0.05 or 0.0500000001 is the float bug this whole
  // ::text/decimal chain exists to prevent (Master PRD §4.3).
  await expect(entry.getByTestId("audit-old").first()).toHaveText("0.1000");
  await expect(entry.getByTestId("audit-new").first()).toHaveText("0.0500");
  // …with the reading an agent recognises alongside it.
  await expect(entry).toContainText("10.00% → 5.00%");
});

test("a 2dp rate keeps its scale: 12.5% stores as 0.1250", async ({ page }) => {
  await openTaxSettings(page);

  await page.getByTestId("vat-rate-input").fill("12.5");
  await saveThroughGate(page);

  await page.reload();
  await expect(page.getByTestId("vat-rate-input")).toHaveValue("12.50");

  await page.goto("/settings/audit-log?entity=tax_settings");
  const entry = page.getByTestId("audit-entry").first();
  await expect(entry.getByTestId("audit-new").first()).toHaveText("0.1250");
});

test("a peso threshold keeps its centavos", async ({ page }) => {
  await openTaxSettings(page);

  await page.getByTestId("property-vat-threshold-input").fill("3500000.00");
  await saveThroughGate(page);

  await page.reload();
  await expect(page.getByTestId("property-vat-threshold-input")).toHaveValue(
    "3500000.00"
  );

  await page.goto("/settings/audit-log");
  await expect(
    page.getByTestId("audit-entry").first().getByTestId("audit-new").first()
  ).toHaveText("3500000.00");
});

test("the chase threshold moves no money, so it saves without a modal", async ({
  page,
}) => {
  await openTaxSettings(page);

  await page.getByTestId("chase-idle-months-input").fill("6");
  await page.getByTestId("save-tax-settings-button").click();

  // Rule 9 reserves gates for money-restating acts. Gating this one would teach
  // the agent to click through the modal that matters.
  await expect(page.getByTestId("tax-confirm-gate")).not.toBeVisible();
  await expect(page.getByTestId("form-message")).toBeVisible();
  // No recompute was queued — the message says so.
  await expect(page.getByTestId("form-message")).not.toContainText(
    "queued for recompute"
  );

  await page.reload();
  await expect(page.getByTestId("chase-idle-months-input")).toHaveValue("6");

  // But it IS audited (rule 12: every settings edit).
  await page.goto("/settings/audit-log");
  await expect(page.getByTestId("audit-entry").first()).toContainText(
    "Chase idle threshold"
  );
});

test("invalid values are refused before they can be submitted", async ({
  page,
}) => {
  await openTaxSettings(page);

  // Mirrors the DB's CHECK constraints (tax_settings_chase_idle_min).
  await page.getByTestId("chase-idle-months-input").fill("0");
  await expect(page.getByTestId("field-error")).toContainText("at least 1 month");
  await expect(page.getByTestId("save-tax-settings-button")).toBeDisabled();

  await page.getByTestId("chase-idle-months-input").fill("6");

  // tax_settings_vat_rate_range: 0 < r < 1.
  await page.getByTestId("vat-rate-input").fill("0");
  await expect(page.getByTestId("save-tax-settings-button")).toBeDisabled();

  // numeric(6,4) would silently round 12.345% to 0.1235 — their rate would just
  // be wrong. Refused instead.
  await page.getByTestId("vat-rate-input").fill("12.345");
  await expect(page.getByTestId("field-error")).toContainText("decimal places");
  await expect(page.getByTestId("save-tax-settings-button")).toBeDisabled();
});

test("the gate is server-side: forcing the button through changes nothing", async ({
  page,
}) => {
  await openTaxSettings(page);

  const before = await page.getByTestId("ewt-rate-input").inputValue();

  await page.getByTestId("ewt-rate-input").fill("8");
  await page.getByTestId("save-tax-settings-button").click();
  await expect(page.getByTestId("tax-confirm-gate")).toBeVisible();

  // M0 test plan #7: "API calls without the confirmation token are rejected".
  // Strip the disabled attribute and submit without ticking the box — the
  // client gate is now bypassed exactly as a forged request would bypass it.
  await page
    .getByTestId("tax-confirm-gate-confirm")
    .evaluate((button: HTMLButtonElement) => {
      button.disabled = false;
      button.removeAttribute("disabled");
    });
  await page.getByTestId("tax-confirm-gate-confirm").click();

  // The server refuses: the dialog stays open carrying the refusal.
  await expect(page.getByTestId("tax-confirm-gate-error")).toContainText(
    "requires confirmation"
  );

  await page.reload();
  await expect(page.getByTestId("ewt-rate-input")).toHaveValue(before);
});

test("the audit log filters by entity and by date", async ({ page }) => {
  await signIn(page);

  // Entity: the tax changes above exist; Maria has renamed nothing.
  await page.goto("/settings/audit-log?entity=tax_settings");
  expect(await page.getByTestId("audit-entry").count()).toBeGreaterThan(0);

  await page.goto("/settings/audit-log?entity=workspace");
  await expect(page.getByTestId("audit-entry")).toHaveCount(0);
  await expect(page.getByText("No changes match these filters")).toBeVisible();

  // Date: a window that ended before today holds none of them. Manila civil
  // days, not UTC — filtering "today" must mean the agent's today.
  await page.goto("/settings/audit-log?from=2020-01-01&to=2020-01-02");
  await expect(page.getByTestId("audit-entry")).toHaveCount(0);

  // Clearing brings them back.
  await page.getByTestId("audit-filter-clear").click();
  await expect(page).toHaveURL(/\/settings\/audit-log$/);
  expect(await page.getByTestId("audit-entry").count()).toBeGreaterThan(0);
});

test("tax settings and the audit log are usable at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openTaxSettings(page);

  await expect(page.getByTestId("ewt-rate-input")).toBeVisible();
  await expect(page.getByTestId("vat-registered-checkbox")).toBeVisible();

  // M0 §6: solo agents run this from their phone. A horizontally scrolling page
  // means something is forcing width.
  const taxOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  expect(taxOverflow).toBe(false);

  await page.goto("/settings/audit-log");
  await expect(page.getByTestId("audit-entry").first()).toBeVisible();

  const auditOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  expect(auditOverflow).toBe(false);
});

/**
 * Restores the fixture. Last in a serial file, so it runs after the assertions
 * above — leaving Maria's workspace at the AC1 defaults for the next run, the
 * same way the rename test in auth-workspace.spec puts the name back.
 */
test("restore the fixture to the AC1 defaults", async ({ page }) => {
  await openTaxSettings(page);

  await page.getByTestId("vat-rate-input").fill(DEFAULTS.vat);
  await page.getByTestId("ewt-rate-input").fill(DEFAULTS.ewt);
  await page.getByTestId("property-vat-threshold-input").fill(DEFAULTS.threshold);
  await page.getByTestId("chase-idle-months-input").fill(DEFAULTS.chase);

  // Restoring rates is itself a money-restating change — it goes through the
  // same gate, which is the point.
  await saveThroughGate(page);

  await page.reload();
  await expect(page.getByTestId("vat-rate-input")).toHaveValue(DEFAULTS.vat);
  await expect(page.getByTestId("ewt-rate-input")).toHaveValue(DEFAULTS.ewt);
  await expect(page.getByTestId("property-vat-threshold-input")).toHaveValue(
    DEFAULTS.threshold
  );
  await expect(page.getByTestId("chase-idle-months-input")).toHaveValue(
    DEFAULTS.chase
  );
});
