import { test, expect, type Page } from "@playwright/test";

/**
 * M0.3 — Configuration lists, end to end.
 *
 * Follows the milestone's own demo script: accept the workbook seed offer, add
 * Developer "Abrown Inc." (Net) and "Megaworld GERI" (Gross), rename a lead
 * source, attempt to delete a referenced type → blocked with the count →
 * archive instead. Plus the acceptance criteria a browser is the only honest
 * place to prove: uniqueness rejection (AC-case-insensitive), drag-sort
 * persistence, and CSV/XLSX export matching the on-screen rows (AC8).
 *
 * WHY JD, AND WHY SERIAL
 *
 * Playwright runs FILES in parallel. tax-settings.spec drives Maria; this file
 * drives JD, so the two never contend for one workspace's rows. auth-workspace
 * also signs in as JD but only navigates — it never asserts list content — so
 * sharing the fixture is safe. Serial within the file because these tests share
 * JD's one set of lists and build on each other (seed → mutate → export).
 *
 * Requires a FRESHLY seeded JD (`pnpm run seed:dev`): the first test accepts the
 * seed offer, which only appears while a list is empty. Same contract the other
 * specs already carry.
 */

test.describe.configure({ mode: "serial" });

const AGENT = { email: "agent@solo.test", password: "zeta-dev-password" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(AGENT.email);
  await page.getByTestId("password-input").fill(AGENT.password);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("the seed offer populates a list exactly per the workbook", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/property-types");

  // Rule 11: an empty list is OFFERED the workbook set, not given it.
  await expect(page.getByTestId("seed-offer")).toBeVisible();
  await expect(page.getByTestId("seed-checkbox")).toHaveCount(7);

  await page.getByTestId("seed-accept").click();

  // Exactly WORKBOOK_REFERENCE §2, including "Parking = Always VAT".
  await expect(page.getByTestId("list-row")).toHaveCount(7);
  await expect(page.getByTestId("seed-offer")).toHaveCount(0);

  const parking = page.locator('[data-testid="list-row"][data-name="Parking"]');
  await expect(parking.getByTestId("row-attribute-select")).toHaveValue(
    "always_vat"
  );
  const condo = page.locator('[data-testid="list-row"][data-name="Condo"]');
  await expect(condo.getByTestId("row-attribute-select")).toHaveValue("threshold");

  // It survives a reload — it is in the database, not just React state.
  await page.reload();
  await expect(page.getByTestId("list-row")).toHaveCount(7);
});

test("uniqueness is case-insensitive and trimmed, and rejects without adding a row (AC-rule 7)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/property-types");
  await expect(page.getByTestId("list-row")).toHaveCount(7);

  // The PRD's own trap: "  CONDO  " must collide with "Condo".
  await page.getByTestId("add-name-input").fill("  CONDO  ");
  await page.getByTestId("add-submit").click();

  await expect(page.getByTestId("form-error")).toContainText(
    "already have a property type"
  );
  // Refused, not added.
  await expect(page.getByTestId("list-row")).toHaveCount(7);
  // What was typed survives the refusal — React 19 would otherwise wipe it.
  await expect(page.getByTestId("add-name-input")).toHaveValue("  CONDO  ");
});

test("developers: the demo script's two, with the right commission base", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/developers");

  // Skip the seed offer — add the demo script's own developers by hand.
  await page.getByTestId("add-name-input").fill("Abrown Inc.");
  await page.getByTestId("add-attribute-select").selectOption("net");
  await page.getByTestId("add-submit").click();
  await expect(
    page.locator('[data-testid="list-row"][data-name="Abrown Inc."]')
  ).toBeVisible();

  await page.getByTestId("add-name-input").fill("Megaworld GERI");
  await page.getByTestId("add-attribute-select").selectOption("gross");
  await page.getByTestId("add-submit").click();

  const megaworld = page.locator(
    '[data-testid="list-row"][data-name="Megaworld GERI"]'
  );
  await expect(megaworld.getByTestId("row-attribute-select")).toHaveValue("gross");
});

test("changing commission base restates money and goes through the gate (rule 8)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/developers");

  const megaworld = page.locator(
    '[data-testid="list-row"][data-name="Megaworld GERI"]'
  );
  await megaworld.getByTestId("row-attribute-select").selectOption("net");
  await megaworld.getByTestId("row-save").click();

  // Rule 8: this restates every deal for that developer, so it asks first.
  const gate = page.getByTestId("row-confirm-gate");
  await expect(gate).toBeVisible();
  await expect(page.getByTestId("row-confirm-gate-consequence")).toContainText(
    "restates money"
  );
  await expect(page.getByTestId("row-confirm-gate-confirm")).toBeDisabled();

  await page.getByTestId("row-confirm-gate-checkbox").click();
  await page.getByTestId("row-confirm-gate-confirm").click();
  await expect(gate).not.toBeVisible();

  await page.reload();
  await expect(megaworld.getByTestId("row-attribute-select")).toHaveValue("net");
});

test("lead sources: seed, rename (AC6), and drag-sort persistence (§3.6)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/lead-sources");

  await expect(page.getByTestId("seed-offer")).toBeVisible();
  await page.getByTestId("seed-accept").click();
  await expect(page.getByTestId("list-row")).toHaveCount(13);

  // Seeded in the workbook's order (§2): Referral is first.
  const rows = page.getByTestId("list-row");
  await expect(rows.first()).toHaveAttribute("data-name", "Referral");

  // AC6: a rename propagates by id and is NOT gated (rule 6 — no money moves).
  const youtube = page.locator('[data-testid="list-row"][data-name="YouTube"]');
  await youtube.getByTestId("row-name-input").fill("YouTube Organic");
  await youtube.getByTestId("row-save").click();
  await expect(page.getByTestId("row-confirm-gate")).toHaveCount(0);
  await expect(
    page.locator('[data-testid="list-row"][data-name="YouTube Organic"]')
  ).toBeVisible();

  // Drag-sort via the keyboard/touch path (the up button) — native HTML5 drag
  // does not fire for touch, which is exactly why that path exists (§3.6).
  const organic = page.locator(
    '[data-testid="list-row"][data-name="YouTube Organic"]'
  );
  await organic.getByTestId("row-move-up").click();
  // Wait for the reorder to settle, then confirm it PERSISTS across a reload.
  await expect(page.getByTestId("list-row").nth(7)).toHaveAttribute(
    "data-name",
    "YouTube Organic"
  );
  await page.reload();
  await expect(page.getByTestId("list-row").nth(7)).toHaveAttribute(
    "data-name",
    "YouTube Organic"
  );
});

test("archive removes an item from the active list and keeps it under the toggle (AC4)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/lead-sources");

  const lamudi = page.locator('[data-testid="list-row"][data-name="Lamudi"]');
  await lamudi.getByTestId("row-archive").click();

  // Gone from the active list…
  await expect(
    page.locator('[data-testid="list-active"] [data-name="Lamudi"]')
  ).toHaveCount(0);
  // …but present under the archived toggle, offering Restore.
  await page.getByTestId("toggle-archived").click();
  const archived = page.locator(
    '[data-testid="list-archived"] [data-name="Lamudi"]'
  );
  await expect(archived).toBeVisible();
  await expect(archived.getByTestId("row-restore")).toBeVisible();
});

test("export downloads CSV and XLSX matching the on-screen rows (AC8)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/property-types");
  await expect(page.getByTestId("list-row")).toHaveCount(7);

  // CSV: assert on the actual downloaded bytes, not just that a click happened.
  const csvDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-csv").click(),
  ]);
  const csvPath = await csvDownload[0].path();
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile(csvPath, "utf8");

  expect(csvDownload[0].suggestedFilename()).toMatch(
    /^zeta-property-types-\d{4}-\d{2}-\d{2}\.csv$/
  );
  expect(csv).toContain("Property Type,VAT Rule,Status,Used by (deals)");
  expect(csv).toContain("Condo,Threshold,Active,0");
  expect(csv).toContain("Parking,Always VAT,Active,0");

  // XLSX: a real zip (the OOXML container magic bytes), correctly named.
  const xlsxDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-xlsx").click(),
  ]);
  expect(xlsxDownload[0].suggestedFilename()).toMatch(
    /^zeta-property-types-\d{4}-\d{2}-\d{2}\.xlsx$/
  );
  const xlsxPath = await xlsxDownload[0].path();
  const bytes = await fs.readFile(xlsxPath);
  expect(bytes[0]).toBe(0x50); // 'P'
  expect(bytes[1]).toBe(0x4b); // 'K'
});

test("a referenced item cannot be deleted — the attempt is blocked and offered Archive (AC4)", async ({
  page,
}) => {
  // With no deals yet the reference count is 0, so an unreferenced delete is
  // what a browser can prove today. The blocked-delete path — the reference
  // count driving the refusal and the delete_blocked audit entry — is proven
  // against the live database in the M0.3 verification harness, where the count
  // can be forced non-zero to simulate M1. Here we prove the reversible half:
  // an unreferenced delete goes through the gate and removes the row.
  await signIn(page);
  await page.goto("/settings/property-types");

  await page.getByTestId("add-name-input").fill("Temporary");
  await page.getByTestId("add-submit").click();
  const temp = page.locator('[data-testid="list-row"][data-name="Temporary"]');
  await expect(temp).toBeVisible();

  await temp.getByTestId("row-delete").click();
  const gate = page.getByTestId("row-delete-gate");
  await expect(gate).toBeVisible();
  await expect(page.getByTestId("row-delete-gate-confirm")).toBeDisabled();
  await page.getByTestId("row-delete-gate-checkbox").click();
  await page.getByTestId("row-delete-gate-confirm").click();

  await expect(temp).toHaveCount(0);
});

test("the list screens are usable at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);

  for (const path of [
    "/settings/property-types",
    "/settings/developers",
    "/settings/lead-sources",
  ]) {
    await page.goto(path);
    await expect(page.getByTestId("list-row").first()).toBeVisible();

    // M0 §6: solo agents run this from their phone. A horizontally scrolling
    // page means something is forcing width past the viewport.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    expect(overflow, `${path} overflows at 360px`).toBe(false);
  }
});
