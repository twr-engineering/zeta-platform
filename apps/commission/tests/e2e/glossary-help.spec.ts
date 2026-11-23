import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M10.1 — glossary + help framework, end to end (DoD: glossary searchable with
 * working #anchors; a HelpPopover on a reference surface opens, is keyboard
 * navigable and a bottom-sheet at 360px; auto-linked glossary terms navigate; the
 * missing-key fallback is graceful). Content is PRODUCT-level, so this needs no deal
 * data — just a throwaway user. Deletes the user after (membership-delete trigger
 * reaps the workspace → delta-residue zero).
 */

test.describe.configure({ mode: "serial" });

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
const HAVE_ENV = Boolean(E.NEXT_PUBLIC_SUPABASE_URL && E.SUPABASE_SERVICE_ROLE_KEY);
const admin: SupabaseClient | null = HAVE_ENV
  ? createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, {
      db: { schema: "commission" },
      auth: { persistSession: false },
    })
  : null;

const PASSWORD = "throwaway-m101-pw";
const users: string[] = [];
let email = "";

test.beforeAll(async () => {
  if (!admin) return;
  const addr = `m101-${Date.now()}@throwaway.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email: addr,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user!.id);
  email = addr;
});

test.afterAll(async () => {
  if (!admin) return;
  for (const uid of users) await admin.auth.admin.deleteUser(uid);
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("glossary renders seeded terms and filters on search", async ({ page }) => {
  test.skip(!admin, "supabase env not present");
  await signIn(page);
  await page.goto("/glossary");

  await expect(page.getByTestId("glossary-entry-gci")).toBeVisible();
  await expect(page.getByTestId("glossary-entry-ewt")).toBeVisible();

  await page.getByTestId("glossary-search").fill("expanded withholding");
  await expect(page.getByTestId("glossary-entry-ewt")).toBeVisible();
  await expect(page.getByTestId("glossary-entry-gci")).toHaveCount(0);

  await page.getByTestId("glossary-search").fill("");
  await expect(page.getByTestId("glossary-entry-gci")).toBeVisible();
});

test("deep link /glossary#gci lands on the GCI entry", async ({ page }) => {
  test.skip(!admin, "supabase env not present");
  await signIn(page);
  await page.goto("/glossary#gci");
  await expect(page.getByTestId("glossary-entry-gci")).toBeInViewport();
});

test("a glossary definition auto-links other terms and they navigate", async ({ page }) => {
  test.skip(!admin, "supabase env not present");
  await signIn(page);
  await page.goto("/glossary");
  // The NET GCI definition ("GCI + incentive (net) − referral out") auto-links GCI.
  const link = page
    .getByTestId("glossary-entry-net-gci")
    .getByTestId("glossary-link-gci");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/glossary#gci$/);
  await expect(page.getByTestId("glossary-entry-gci")).toBeInViewport();
});

test("legend explainer popover opens, auto-links GCI, and is keyboard navigable", async ({
  page,
}) => {
  test.skip(!admin, "supabase env not present");
  await signIn(page);
  await page.goto("/glossary");

  // Opens fast from the in-memory bundle.
  await page.getByTestId("legend-explainer").click();
  const popover = page.getByTestId("help-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Only blue cells editable");

  // The article body ("GCI = billed ÷ 1.12") auto-links GCI → /glossary#gci.
  await popover.getByTestId("glossary-link-gci").click();
  await expect(page).toHaveURL(/\/glossary#gci$/);

  // Keyboard: focus the trigger, open with Enter, close with Escape.
  await page.getByTestId("legend-explainer").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("help-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("help-popover")).toHaveCount(0);
});

test("at 360px the help opens as a bottom sheet (rule 13)", async ({ page }) => {
  test.skip(!admin, "supabase env not present");
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await page.goto("/glossary");

  await page.getByTestId("legend-explainer").click();
  const sheet = page.getByTestId("help-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Only blue cells editable");
  // It is docked to the bottom edge of the viewport.
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.y + box.height).toBeGreaterThan(740 - 4);
});
