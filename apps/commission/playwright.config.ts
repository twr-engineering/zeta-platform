import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for agency apps.
 * Tests live in tests/e2e/ and run against a running app server.
 *
 * TWO postures (M10.5 CI hardening — the M10.4 recommendation):
 *
 *  - LOCAL (default): tests hit the user-owned `next dev` on :3000. `next dev`
 *    recompiles a route on first hit, and a server-action POST that races that
 *    recompile fails with "an unexpected response was received from the server" —
 *    a harness/dev-server artifact, not a product bug (observed 2026-07-17 under
 *    parallel workers). The one local retry + 15 s expect timeout below exist ONLY
 *    to absorb that dev-server flake class.
 *
 *  - PROD (E2E_PROD=1): tests hit a `next build` + `next start -p 3100` server on
 *    :3100 (baseURL swaps automatically; the config starts/reuses the server via
 *    the `webServer` block). A production server serves prebuilt routes — there is
 *    no per-route compile, so the recompile-race flake class does not exist. This
 *    is the posture the two §9 journey scripts run under in CI. Build first
 *    (`pnpm run build:check` writes to .next-build, the dir this server reads), or
 *    let CI's e2e-prod job do it; `webServer` only starts an already-built server.
 */
const PROD = process.env.E2E_PROD === "1";
const PROD_URL = "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Local dev keeps one retry for the recompile race described above. Against a
  // prod server that race is gone, so no local retry is needed there; CI keeps 2.
  retries: process.env.CI ? 2 : PROD ? 0 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,

  // 5s (Playwright's default) is shorter than a cold `next dev` route compile, so
  // it produced failures that looked like app bugs but were the harness racing the
  // compiler. A prod server has no such compile; the generous window is harmless.
  expect: { timeout: 15000 },

  use: {
    // Base URL — PROD posture points at the :3100 prod server; override either with
    // PLAYWRIGHT_BASE_URL.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || (PROD ? PROD_URL : "http://localhost:3000"),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // LOCAL: don't auto-start anything — the user's dev server is already running.
  // PROD: start (or reuse) the prebuilt :3100 server. It only *starts* the server;
  // the build (`build:check` → .next-build) must already have run. reuseExistingServer
  // lets a locally-started :3100 be reused; CI always starts its own.
  webServer: PROD
    ? {
        command: "NEXT_DIST_DIR=.next-build pnpm exec next start -p 3100",
        url: `${PROD_URL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
