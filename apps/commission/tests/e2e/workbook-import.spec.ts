import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M1.4 — the v30.x workbook importer, end to end through the real UI
 * (FR-M1-10). The importer PRESERVES the workbook's deal codes, so it only runs
 * on an EMPTY workspace — which the seeded agents are not (other specs give them
 * deals). So this spec provisions its OWN throwaway users via the admin API
 * (a fresh empty workspace each, signup-bootstrapped like a real sign-up) and
 * deletes them afterwards — delta-residue zero, the real account untouched.
 *
 *   - the committed SYNTHETIC fixture drives the upload → dry-run → confirm →
 *     import → idempotency flow (small, no real data);
 *   - the REAL v30.20 workbook (referenced from discovery/source at runtime, never
 *     committed here) drives the §9 anchor assertion in the browser when present.
 */

test.describe.configure({ mode: "serial" });

const FIXTURE = path.resolve(__dirname, "../fixtures/synthetic-workbook.xlsx");
const REAL_WORKBOOK = path.resolve(
  __dirname,
  "../../discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx"
);

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

const PASSWORD = "throwaway-import-e2e-pw";
const created: string[] = [];

async function throwawayUser(): Promise<string> {
  const email = `import-e2e-${Date.now()}-${Math.floor(performance.now())}@throwaway.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user!.id);
  return email;
}

test.afterAll(async () => {
  for (const uid of created) await admin.auth.admin.deleteUser(uid);
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("synthetic workbook: dry-run → typed confirm → import → idempotent refusal", async ({
  page,
}) => {
  const email = await throwawayUser();
  await signIn(page, email);

  await page.goto("/deals/import");
  await page.getByTestId("import-file").setInputFiles(FIXTURE);

  // Dry run: writes nothing, renders the summary.
  await page.getByTestId("import-dry-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
  await expect(page.getByTestId("import-reconciliation")).toContainText("within ₱0.01");
  // 3 deals, code gap preserved → next new deal D006.
  await expect(page.getByTestId("import-summary")).toContainText("D006");

  // Typed confirmation gates the real run.
  await page.getByTestId("import-run").isVisible();
  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();

  // Committed.
  await expect(page.getByTestId("import-done")).toBeVisible();
  await expect(page.getByTestId("import-done")).toContainText("Workbook imported");

  // Idempotency: the page now shows the workspace already has deals (no wizard).
  await page.goto("/deals/import");
  await expect(page.getByTestId("import-file")).toHaveCount(0);
  await expect(page.getByText(/already/i)).toBeVisible();

  // The deals landed with their preserved codes.
  await page.goto("/deals");
  await expect(page.getByText("D001").first()).toBeVisible();
  await expect(page.getByText("D005").first()).toBeVisible();
});

test("real v30.20 workbook: the §9 anchors reproduce in the browser", async ({
  page,
}) => {
  test.skip(!existsSync(REAL_WORKBOOK), "real workbook not present in discovery/source");

  const email = await throwawayUser();
  await signIn(page, email);

  await page.goto("/deals/import");
  await page.getByTestId("import-file").setInputFiles(REAL_WORKBOOK);
  await page.getByTestId("import-dry-run").click();

  const summary = page.getByTestId("import-summary");
  await expect(summary).toBeVisible();
  await expect(page.getByTestId("import-reconciliation")).toContainText("within ₱0.01");
  // Σ Total Collectible and Σ Collected net — the Master PRD §9 anchors.
  await expect(summary).toContainText("6,763,497.25");
  await expect(summary).toContainText("1,908,192.86");
  await expect(summary).toContainText("D022");

  await page.getByTestId("import-confirm-input").fill("IMPORT");
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-done")).toBeVisible();
  await expect(page.getByTestId("import-done")).toContainText("21 deals");
});
