import { defineConfig, devices } from '@playwright/test'

/**
 * E2E for Zeta Comps (app PRD §17.2): Chromium and WebKit (NFR-007), light and dark.
 * Runs against `next start` on :3913 (build first). Needs DATABASE_URI (migrated by apps/cms),
 * PAYLOAD_SECRET and APP_ENV (not production). The setup project signs the shared admin in
 * once; screen tests reuse that cookie.
 */
const PORT = 3913
const baseURL = `http://localhost:${PORT}`

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
    { name: 'chromium-light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' }, dependencies: ['setup'] },
    { name: 'chromium-dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' }, dependencies: ['setup'] },
    { name: 'webkit-light', use: { ...devices['Desktop Safari'], colorScheme: 'light' }, dependencies: ['setup'] },
    { name: 'webkit-dark', use: { ...devices['Desktop Safari'], colorScheme: 'dark' }, dependencies: ['setup'] },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
