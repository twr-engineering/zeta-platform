import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * M10.4 — contextual help placements, empty-state registry & help-opened
 * instrumentation, end to end. Content is PRODUCT-level and the placements/empty
 * states covered here need NO deal data, so a throwaway user suffices (the
 * data-bound receivable placements P6/P7/P8 + dashboard P9 are exercised over the
 * imported workbook in collectibles.spec / dashboard.spec). The user is deleted
 * after → the membership-delete trigger reaps the workspace, delta-residue zero.
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

const PASSWORD = "throwaway-m104-pw";
const users: string[] = [];
let email = "";

test.beforeAll(async () => {
  if (!admin) return;
  const addr = `m104-${Date.now()}@throwaway.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email: addr,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user!.id);
  email = addr;

  // The bootstrap creates the workspace + tax settings but no configuration lists,
  // so /deals/new shows a "set up your lists" gate rather than the form. Seed the
  // minimum (one property type + one lead source) so the deal-form placements have
  // a form to render. Service-role insert (bypasses RLS); reaped with the user.
  const { data: mem } = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", data.user!.id)
    .maybeSingle();
  const workspaceId = mem?.workspace_id;
  if (workspaceId) {
    await admin
      .from("property_type")
      .insert({ workspace_id: workspaceId, name: "House & Lot", vat_rule: "always_vat" });
    await admin
      .from("lead_source")
      .insert({ workspace_id: workspaceId, name: "Referral", sort_order: 1 });
    // A Net Income Target for the current year (no deals) takes /calculator PAST the
    // "set a target" gate to the §6.4 basis-unavailable state (planning basis /
    // manual-entry copy) — the M3 empty state the registry describes.
    await admin.from("plan_year_target").insert({
      workspace_id: workspaceId,
      year: new Date().getFullYear(),
      net_income_target: 1_000_000,
      opex_pct: 0.3,
      cos_pct: 0.2,
    });
  }
});

test.afterAll(async () => {
  if (!admin) return;
  for (const uid of users) await admin.auth.admin.deleteUser(uid);
});

async function signIn(page: Page) {
  test.skip(!admin, "no service-role env");
  await page.goto("/login");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// --- P2 · deal form (AC6) ---------------------------------------------------

test("P2 — the commission '?' renders VAT-inclusive-billing verbatim with a glossary link (AC6)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/deals/new");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");

  await page.getByTestId("help-deal-commission-basis").click();
  const popover = page.getByTestId("help-popover");
  await expect(popover).toBeVisible();
  // Verbatim P2 (§6.3): the Megaworld example numbers + the Fixed escape hatch.
  await expect(popover).toContainText(
    "the commission a developer bills already has the 12% VAT inside it"
  );
  await expect(popover).toContainText("322,369.80 billed");
  await expect(popover).toContainText("Basis = Fixed");
  // Glossary auto-link resolves.
  await expect(popover.getByTestId("help-open-glossary")).toBeVisible();
});

test("P3 & P10 — representation and mode-of-payment '?' open their doctrines", async ({ page }) => {
  await signIn(page);
  await page.goto("/deals/new");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");

  await page.getByTestId("help-deal-representation").click();
  await expect(page.getByTestId("help-popover")).toContainText("Double Ended = you represent BOTH sides");
  await page.keyboard.press("Escape");

  await page.getByTestId("help-deal-mode-of-payment").click();
  await expect(page.getByTestId("help-popover")).toContainText("pre-selling Cash = current");
});

// --- P0 · dashboard header, P11 · tax settings ------------------------------

test("P0 — the dashboard header '?' renders the philosophy verbatim", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard");
  await page.getByTestId("help-dashboard-header").click();
  await expect(page.getByTestId("help-popover")).toContainText(
    "Track total commission owed per deal vs cash actually collected"
  );
});

test("P11 — the EWT '?' on tax settings renders the 5% sworn-declaration option", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/tax");
  await page.getByTestId("help-settings-tax").click();
  await expect(page.getByTestId("help-popover")).toContainText(
    "5% applies if gross receipts are ≤₱3M with a sworn declaration"
  );
});

// --- Empty-state registry over a fresh workspace (§6.4, AC10) ---------------

test("empty-state registry — each fresh M1–M9 surface renders its empty state", async ({ page }) => {
  // Nine sequential route visits; in isolation each is a cold dev-server compile,
  // so give the walk room and use domcontentloaded (the empty-state assertions
  // auto-wait for their own element anyway).
  test.slow();
  const go = (p: string) => page.goto(p, { waitUntil: "domcontentloaded" });
  await signIn(page);

  await go("/deals");
  await expect(page.getByTestId("empty-state-deals")).toBeVisible();

  await go("/collectibles");
  await expect(page.getByTestId("empty-state-receivables")).toBeVisible();

  await go("/payments");
  // Fresh workspace has no deals → the "log a deal first" variant.
  await expect(page.getByTestId("empty-state-payments")).toContainText("log a deal first");

  await go("/dashboard");
  await expect(page.getByTestId("dashboard-empty")).toContainText(
    "Your position appears after your first deal"
  );

  await go("/yield-summary");
  await expect(page.getByTestId("empty-state-yield")).toBeVisible();

  await go("/calculator");
  await expect(page.getByTestId("empty-state-calculator")).toContainText("Planning basis");

  await go("/source-performance");
  await expect(page.getByTestId("empty-state-sources")).toBeVisible();

  await go("/reports/monthly-cash-flow");
  await expect(page.getByTestId("empty-state-reports")).toBeVisible();

  await go("/search");
  await expect(page.getByTestId("search-console")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("search-empty-message")).toHaveText("Nothing to search yet.");
});

// --- 360px bottom sheet (rule 13) -------------------------------------------

test("at 360px a deal-form '?' opens as a bottom sheet", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/deals/new");
  await expect(page.getByTestId("deal-form")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("help-deal-commission-basis").click();
  const sheet = page.getByTestId("help-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("VAT inside it");
});

// --- help-opened instrumentation (FR-M10-18) --------------------------------

test("help-opened instrumentation records an event per placement (no money)", async ({ page }) => {
  test.skip(!admin, "no service-role env");
  await signIn(page);
  await page.goto("/settings/tax");
  await page.getByTestId("help-settings-tax").click();
  await expect(page.getByTestId("help-popover")).toBeVisible();

  // The event is written best-effort, fire-and-forget — poll for it.
  await expect
    .poll(
      async () => {
        const { data } = await admin!
          .from("onboarding_event")
          .select("event_type, metadata")
          .eq("event_type", "help_opened");
        return (data ?? []).some(
          (e) => (e.metadata as { placement?: string })?.placement === "settings.tax"
        );
      },
      { timeout: 5000 }
    )
    .toBe(true);
});
