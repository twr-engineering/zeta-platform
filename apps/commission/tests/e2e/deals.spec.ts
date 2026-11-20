import { test, expect, type Page } from "@playwright/test";

/**
 * M1.3 — Deal entry UI & list, end to end (acceptance criteria 1–7, 10–11).
 *
 * Follows the milestone demo script: log D021's inputs, watch the panel show
 * ₱354,591.84 live, save, open the detail, edit the list price and watch it
 * recompute + audit, exercise the rental 1/12 preset and the split-at-source
 * warning, then the list's search / sort / filter / export and its 360px cards.
 *
 * WHY agent3 (Dealer), AND WHY SERIAL
 *
 * Playwright runs FILES in parallel. tax-settings drives Maria and mutates her
 * tax rates (which would move these computed figures); configuration-lists
 * drives JD and, like this file, needs the workbook seed offer on an EMPTY list.
 * A dedicated agent keeps this file's lists stable and its empty-list moment its
 * own. Serial within the file because the tests build on each other (set up
 * lists → log D001 → edit D001 → …) and share Dealer's one workspace.
 *
 * Requires a FRESHLY seeded agent3 (`pnpm run seed:dev`): the first tests assert
 * the empty deal state and accept the seed offers, both of which only hold on a
 * clean workspace. Same contract the other specs carry.
 */

test.describe.configure({ mode: "serial" });

const AGENT = { email: "agent3@solo.test", password: "zeta-dev-password" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(AGENT.email);
  await page.getByTestId("password-input").fill(AGENT.password);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Open the new-deal form and wait for it to hydrate. The form is a client
 * component; a change fired into a controlled <select> before React hydrates
 * updates the DOM but not the state, and the next render reverts it. The form
 * flips data-hydrated once its mount effect runs — waiting for that makes every
 * interaction below deterministic.
 */
async function gotoNewDeal(page: Page) {
  await page.goto("/deals/new");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");
}

/** Fill the "What closed" + "The money" groups for D021 (a Developer deal). */
async function fillD021(page: Page) {
  await page.getByTestId("field-dealType").selectOption("developer");
  await page.getByTestId("field-bookedDate").fill("2026-07-10");
  await page.getByTestId("field-developerId").selectOption({ label: "Abrown Inc." });
  await page.getByTestId("field-clientName").fill("Daria & John Salon");
  await page.getByTestId("field-representation").selectOption("double_ended");
  await page.getByTestId("field-propertyTypeId").selectOption({ label: "House & Lot" });
  await page.getByTestId("field-leadSourceId").selectOption({ label: "YouTube" });
  await page.getByTestId("field-propertyDetails").fill("House & Lot, Xavier Estates");
  await page.getByTestId("field-modeOfPayment").selectOption("bank");
  await page.getByTestId("field-listPrice").fill("8000000");
  await page.getByTestId("field-rate").fill("5");
  await page.getByTestId("field-incentiveBilled").fill("40000");
  await page.getByTestId("field-incentiveTaxable").selectOption("yes");
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the empty deal state offers logging and the importer", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByRole("heading", { name: /No deals yet/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Log a deal/ })).toBeVisible();
  await expect(page.getByTestId("empty-import")).toBeVisible();
});

test("set up the configuration lists from the seed offers", async ({ page }) => {
  // Idempotent: accepting a seed offer removes it, so a serial-mode retry must
  // tolerate a list that a partial earlier attempt already populated.
  for (const path of ["property-types", "developers", "lead-sources"]) {
    await page.goto(`/settings/${path}`);
    const accept = page.getByTestId("seed-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
    await expect(page.getByTestId("list-row").first()).toBeVisible();
  }
});

test("D021 shows the exact computed panel live, then persists (AC1)", async ({ page }) => {
  await gotoNewDeal(page);
  await fillD021(page);

  // The panel is live and centavo-exact BEFORE any save (AC1).
  await expect(page.getByTestId("computed-net-gci")).toHaveText("₱ 354,591.84");
  await expect(page.getByTestId("computed-net-list")).toHaveText("₱ 7,142,857.14");
  await expect(page.getByTestId("computed-gci")).toHaveText("₱ 318,877.55");
  await expect(page.getByTestId("computed-incentive-net")).toHaveText("₱ 35,714.29");
  await expect(page.getByTestId("computed-vat-memo")).toHaveText("₱ 42,551.02");
  await expect(page.getByTestId("computed-ewt-memo")).toHaveText("₱ 35,459.18");
  await expect(page.getByTestId("computed-yield")).toHaveText("4.4324%");

  await page.getByTestId("deal-submit").click();
  await expect(page).toHaveURL(/\/deals$/);

  // The row is there, with NET GCI to the centavo.
  const row = page.getByTestId("deal-row").filter({ hasText: "Daria & John Salon" });
  await expect(row).toContainText("₱ 354,591.84");

  // The detail reproduces every figure, and the history holds exactly one entry.
  await page.goto("/deals/D001");
  await expect(page.getByTestId("detail-net-gci")).toHaveText("₱ 354,591.84");
  await expect(page.getByTestId("detail-gci")).toHaveText("₱ 318,877.55");
  await expect(page.getByTestId("detail-vat-memo")).toHaveText("₱ 42,551.02");
  await expect(page.getByTestId("detail-ewt-memo")).toHaveText("₱ 35,459.18");
  await expect(page.getByTestId("deal-audit-history").locator("li")).toHaveCount(1);
});

test("editing the list price recomputes and audits (AC8)", async ({ page }) => {
  await page.goto("/deals/D001/edit");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");
  // The stored 5% rate reads back as a percent, not 0.05 (§4 rule 17).
  await expect(page.getByTestId("field-rate")).toHaveValue("5");

  await page.getByTestId("field-listPrice").fill("9000000");
  await expect(page.getByTestId("computed-net-gci")).toHaveText("₱ 394,451.53");

  await page.getByTestId("deal-submit").click();
  await expect(page).toHaveURL(/\/deals\/D001$/);

  await expect(page.getByTestId("detail-net-gci")).toHaveText("₱ 394,451.53");
  const updated = page.getByTestId("deal-audit-history").locator("li").first();
  await expect(updated).toContainText("Updated");
  await expect(updated).toContainText("8000000.00 → 9000000.00");
});

test("a rental uses the exact 1/12 preset (AC6)", async ({ page }) => {
  await gotoNewDeal(page);
  await page.getByTestId("field-transactionType").selectOption("rental");
  // Rental forces deal type N/A and hides the developer picker.
  await expect(page.getByTestId("dealtype-rental-static")).toBeVisible();

  await page.getByTestId("field-bookedDate").fill("2026-04-13");
  await page.getByTestId("field-clientName").fill("Joy Trenholme");
  await page.getByTestId("field-representation").selectOption("lessor");
  await page.getByTestId("field-propertyTypeId").selectOption({ label: "House & Lot" });
  await page.getByTestId("field-leadSourceId").selectOption({ label: "Repeat Client" });
  await page.getByTestId("field-propertyDetails").fill("One-year lease");
  await page.getByTestId("field-modeOfPayment").selectOption("cash");
  await page.getByTestId("field-listPrice").fill("270000");

  await page.getByTestId("rate-onemonth-preset").click();
  await expect(page.getByTestId("field-rate")).toHaveValue("1/12");
  await expect(page.getByTestId("computed-gci")).toHaveText("₱ 22,500.00");
  await expect(page.getByTestId("computed-yield")).toHaveText("8.3333%");

  await page.getByTestId("deal-submit").click();
  await expect(page).toHaveURL(/\/deals$/);
});

test("a one-sided resale with a referral out warns and the override is audited (AC10)", async ({ page }) => {
  await gotoNewDeal(page);
  await page.getByTestId("field-dealType").selectOption("resale");
  await page.getByTestId("field-bookedDate").fill("2026-03-10");
  await page.getByTestId("field-clientName").fill("Split Test Buyer");
  await page.getByTestId("field-representation").selectOption("buyer");
  await page.getByTestId("field-propertyTypeId").selectOption({ label: "House & Lot" });
  await page.getByTestId("field-leadSourceId").selectOption({ label: "Referral" });
  await page.getByTestId("field-propertyDetails").fill("Resale co-broke unit");
  await page.getByTestId("field-modeOfPayment").selectOption("cash");
  await page.getByTestId("field-listPrice").fill("5000000");
  await page.getByTestId("field-rate").fill("5");
  await page.getByTestId("field-referralOutPct").fill("2");

  // Wait for the preview to reflect the referral out (5% × 5M = 250k, − 2% =
  // 245k), which proves the referral registered before checking the warning.
  await expect(page.getByTestId("computed-net-gci")).toHaveText("₱ 245,000.00");

  // The soft warning shows and the save requires explicit continue.
  await expect(page.getByTestId("deal-warning-split_at_source")).toBeVisible();
  await expect(page.getByTestId("deal-submit")).toHaveText(/Save anyway/);

  await page.getByTestId("deal-submit").click();
  await expect(page).toHaveURL(/\/deals$/);

  // The override is on the deal's audit trail.
  await page.goto("/deals/D003");
  await expect(page.getByTestId("deal-audit-history")).toContainText("Warning override");
  await expect(page.getByTestId("deal-audit-history")).toContainText("split_at_source");
});

test("the list searches, sorts, filters by year and exports", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByTestId("deal-row")).toHaveCount(3); // D001, D002, D003 active

  // Search narrows to the rental.
  await page.getByTestId("deal-search").fill("Joy");
  await expect(page.getByTestId("deal-row")).toHaveCount(1);
  await expect(page.getByTestId("deal-row")).toHaveAttribute("data-code", "D002");
  await page.getByTestId("deal-search").fill("");

  // Sort ascending by NET GCI puts the ₱22,500 rental first.
  await page.getByTestId("sort-net_gci").click();
  await expect(page.getByTestId("deal-row").first()).toHaveAttribute("data-code", "D002");

  // Column chooser reveals GCI.
  await page.getByTestId("column-chooser-toggle").click();
  await page.getByTestId("column-toggle-gci").click();
  await expect(page.getByTestId("deal-table").locator("thead")).toContainText("GCI");

  // Year filter.
  await page.getByTestId("deal-year").selectOption("2026");
  await expect(page.getByTestId("deal-row")).toHaveCount(3);

  // Export returns a real CSV of the current view.
  const res = await page.request.get("/api/export/deals?format=csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain("NET GCI");
});

test("the list collapses to cards at 360px (AC — mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/deals");
  const card = page.getByTestId("deal-card").first();
  await expect(card).toBeVisible();
  // The card shows code, client, NET GCI and date.
  await expect(card).toContainText("D001");
  await expect(card).toContainText("₱");
  // No horizontal overflow at 360.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= 362
  );
  expect(overflow).toBe(true);
});

/**
 * M1.5 — the recompute service, end to end. By now Dealer's workspace holds
 * taxable deals (D001 is a developer deal), so changing EWT must state an HONEST
 * count in the confirmation (the M0.2 stub, now real), then restate those deals
 * behind it — a per-deal audit entry and a moved EWT memo on D001. Runs LAST in
 * the serial chain so the rate change disturbs no earlier assertion.
 */
test("changing EWT restates the taxable deals behind an honest confirmation (M1.5)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/settings/tax");

  await page.getByTestId("ewt-rate-input").fill("5");
  await page.getByTestId("save-tax-settings-button").click();

  const gate = page.getByTestId("tax-confirm-gate");
  await expect(gate).toBeVisible();
  // The honest count: a real number of deals, NOT the zero-deal copy.
  await expect(page.getByTestId("tax-confirm-gate-consequence")).toContainText(
    /recompute \d+ deals?/
  );

  await page.getByTestId("tax-confirm-gate-checkbox").click();
  await page.getByTestId("tax-confirm-gate-confirm").click();
  await expect(gate).not.toBeVisible();

  // The restatement landed on D001 (a taxable developer deal): its own history
  // now carries an "Updated" entry showing the EWT memo moved.
  await page.goto("/deals/D001");
  const history = page.getByTestId("deal-audit-history");
  await expect(history).toContainText("Updated");
  await expect(history).toContainText("EWT (memo)");
});
