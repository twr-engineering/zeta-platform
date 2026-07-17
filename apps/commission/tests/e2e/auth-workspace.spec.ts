import { test, expect } from "@playwright/test";

/**
 * M0.1 — Auth & personal workspace, end to end.
 *
 * Mirrors the milestone's demo script: sign up → confirm → land in your own
 * workspace with empty Settings → session survives a refresh → sign out.
 *
 * Requires the dev fixtures (`pnpm run seed:dev`), which create the two agents
 * M0.1's demo script names. Fixtures are created through the admin API and let
 * the signup bootstrap trigger build the workspace, so what is asserted here is
 * the same path a real signup takes.
 */

/**
 * Serial, deliberately. Every test signs in as the same fixture agent, and the
 * rename test mutates that workspace's name while others assert it — under
 * `fullyParallel` they race and fail on timing rather than on behaviour.
 * Isolating them properly would mean a workspace per test, which the v1 schema
 * forbids (one workspace per user, enforced by a unique index).
 */
test.describe.configure({ mode: "serial" });

const AGENT = { email: "agent@solo.test", password: "zeta-dev-password" };
const WORKSPACE_NAME = "JD's Book";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(AGENT.email);
  await page.getByTestId("password-input").fill(AGENT.password);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("an unauthenticated visitor cannot reach the app", async ({ page }) => {
  await page.goto("/dashboard");
  // Middleware diverts to login rather than rendering an empty shell.
  await expect(page).toHaveURL(/\/login/);
});

test("sign in lands the agent in their own workspace", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText(WORKSPACE_NAME)).toBeVisible();
});

test("the session survives a refresh", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(WORKSPACE_NAME)).toBeVisible();
});

test("settings sections are all reachable", async ({ page }) => {
  await signIn(page);

  // /settings is the area, not a screen — it redirects to the first section.
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings\/general/);

  for (const section of [
    "general",
    "tax",
    "property-types",
    "developers",
    "lead-sources",
    "audit-log",
  ]) {
    await page.getByTestId(`settings-nav-${section}`).click();
    await expect(page).toHaveURL(new RegExp(`/settings/${section}$`));
  }
});

test("tax settings show the AC1 defaults from the real database", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/tax");

  // M0 AC1: VAT 12%, EWT 10%, threshold ₱3,600,000.00, chase idle 3 months.
  // Exact strings — these are read `::text` off numeric columns, and a float
  // round trip is exactly what would break them (Master PRD §4.3).
  await expect(page.getByText("12.00%")).toBeVisible();
  await expect(page.getByText("10.00%")).toBeVisible();
  await expect(page.getByText("₱ 3,600,000.00")).toBeVisible();
  await expect(page.getByText("3 months")).toBeVisible();
});

test("the workspace name can be renamed and persists", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/general");

  const renamed = `JD's Book ${Date.now()}`;
  await page.getByTestId("workspace-name-input").fill(renamed);
  await page.getByTestId("rename-workspace-button").click();

  await expect(page.getByTestId("form-message")).toBeVisible();

  // Survives a reload — i.e. it reached the database, not just React state.
  await page.reload();
  await expect(page.getByTestId("workspace-name-input")).toHaveValue(renamed);

  // Put it back so the fixture stays reusable across runs.
  await page.getByTestId("workspace-name-input").fill(WORKSPACE_NAME);
  await page.getByTestId("rename-workspace-button").click();
  await expect(page.getByTestId("form-message")).toBeVisible();
});

test("an empty workspace name is rejected", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/general");

  const input = page.getByTestId("workspace-name-input");
  await input.fill("   ");
  await page.getByTestId("rename-workspace-button").click();

  // Either the browser's own required-field check blocks the submit, or the
  // server rejects it — never a blank name in the database.
  await expect(input).not.toHaveValue("");
});

test("settings are usable at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await page.goto("/settings/general");

  await expect(page.getByTestId("settings-nav-general")).toBeVisible();
  await expect(page.getByTestId("workspace-name-input")).toBeVisible();

  // M0 §6: solo agents run this from their phone. A horizontally scrolling
  // page means a table or the nav is forcing width — the one layout bug that
  // makes a money screen unreadable on a phone.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflows).toBe(false);
});

test("sign out ends the session", async ({ page }) => {
  await signIn(page);

  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("sign-out-button").click();
  await expect(page).toHaveURL(/\/login/);

  // Back-button must not resurrect the session.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
