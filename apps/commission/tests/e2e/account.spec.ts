import { test, expect } from "@playwright/test";

/**
 * M0.4 — Account polish & data ownership, end to end.
 *
 * Signs in as the JD fixture (`pnpm run seed:dev`). Everything here is
 * NON-DESTRUCTIVE by design: the password change and account deletion sign the
 * user out / delete the fixture, which would break every other spec that shares
 * these two agents (the v1 schema forbids a workspace per test). Those flows are
 * proven against throwaway users at the API + browser level in the M0.4
 * verification, documented in prd/progress.txt. Here we cover the display-name
 * edit, the whole-workspace export, and the deletion GATE — up to but not
 * through the irreversible click.
 */

test.describe.configure({ mode: "serial" });

const AGENT = { email: "agent@solo.test", password: "zeta-dev-password" };

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(AGENT.email);
  await page.getByTestId("password-input").fill(AGENT.password);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("the account screen renders real identity and the data controls", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/general");

  // Real data, not a placeholder: the display name and email come from the row.
  await expect(page.getByTestId("display-name-input")).toHaveValue("JD");
  await expect(page.getByText(AGENT.email).first()).toBeVisible();

  // Password change is disabled until a valid, matching new password is typed.
  await expect(page.getByTestId("change-password-button")).toBeDisabled();

  // The data-ownership controls are present.
  await expect(page.getByTestId("export-workspace")).toBeVisible();
  await expect(page.getByTestId("delete-account-button")).toBeVisible();
});

test("the display name can be changed and is audited", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/general");

  const updated = `JD ${Date.now()}`;
  await page.getByTestId("display-name-input").fill(updated);
  await page.getByTestId("save-display-name-button").click();
  await expect(page.getByTestId("form-message")).toBeVisible();

  // The change is in the audit trail, filterable under the account/profile entity.
  await page.goto("/settings/audit-log?entity=profile");
  await expect(page.getByTestId("audit-entries")).toContainText("Display name");
  await expect(page.getByTestId("audit-entries")).toContainText(updated);

  // Put it back so the fixture stays reusable.
  await page.goto("/settings/general");
  await page.getByTestId("display-name-input").fill("JD");
  await page.getByTestId("save-display-name-button").click();
  await expect(page.getByTestId("form-message")).toBeVisible();
});

test("the whole workspace exports as a zip", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/general");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-workspace").click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^zeta-workspace-\d{4}-\d{2}-\d{2}\.zip$/);
});

test("deletion is gated on the exact typed phrase and offers the export first", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/general");

  await page.getByTestId("delete-account-button").click();

  // The export offer precedes the deletion (FR-M0-10).
  await expect(page.getByTestId("delete-export-offer")).toBeVisible();

  // Confirm stays disabled for the empty and the wrong phrase...
  const confirm = page.getByTestId("delete-account-gate-confirm");
  await expect(confirm).toBeDisabled();
  await page.getByTestId("delete-account-gate-input").fill("delete workspace");
  await expect(confirm).toBeDisabled();

  // ...and only the exact phrase arms it. We stop here — clicking would delete
  // the shared fixture. The destructive path is verified against throwaway
  // users (prd/progress.txt).
  await page.getByTestId("delete-account-gate-input").fill("delete my workspace");
  await expect(confirm).toBeEnabled();

  await page.getByTestId("delete-account-gate-cancel").click();
});
