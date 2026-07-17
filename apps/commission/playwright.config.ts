import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for agency apps.
 * Tests live in tests/e2e/ and run against the dev server.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,

  // Playwright's default is 5s, which is shorter than a cold `next dev` route
  // compile: the first server action on a freshly-compiled route took ~2s here,
  // and more on a cold start, so 5s produced failures that looked like app bugs
  // but were the harness racing the compiler (2026-07-17).
  expect: { timeout: 15000 },

  use: {
    // Base URL — override with PLAYWRIGHT_BASE_URL env var
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Don't auto-start a web server — app should already be running
});
