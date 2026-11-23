import { defineConfig, devices } from '@playwright/test'

/**
 * E2E for Zeta Comps (app PRD §17.2): Chromium and WebKit (NFR-007), light and dark.
 * Runs against `next start` on :3913 (build first). Needs DATABASE_URI (migrated by apps/cms),
 * PAYLOAD_SECRET and APP_ENV (not production). The setup project signs the shared admin in
 * once; screen tests reuse that cookie.
 * Staging (M9): set E2E_BASE_URL to a deployed URL to run the same suite against it; no local
 * server is started, and DATABASE_URI must point at the database that deployment uses.
 */
const PORT = 3913
const REMOTE = process.env.E2E_BASE_URL?.replace(/\/$/, '')
const baseURL = REMOTE ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: /admin\.setup\.ts/ },
    { name: 'chromium-light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' }, dependencies: ['setup'], grepInvert: /@write/ },
    { name: 'chromium-dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' }, dependencies: ['setup'], grepInvert: /@write/ },
    { name: 'webkit-light', use: { ...devices['Desktop Safari'], colorScheme: 'light' }, dependencies: ['setup'], grepInvert: /@write/ },
    { name: 'webkit-dark', use: { ...devices['Desktop Safari'], colorScheme: 'dark' }, dependencies: ['setup'], grepInvert: /@write/ },
    // Tests that change data run once, after every read-only project, so exact counts never race a write.
    {
      name: 'writes',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
      grep: /@write/,
      // One at a time: a Settings rename in one file must not race a save in another.
      workers: 1,
      fullyParallel: false,
      dependencies: ['chromium-light', 'chromium-dark', 'webkit-light', 'webkit-dark'],
    },
  ],
  webServer: REMOTE
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
