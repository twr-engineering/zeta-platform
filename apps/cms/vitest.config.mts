import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Needs a migrated database: run by `pnpm test:db` (vitest.db.config.mts) after migrate.
    exclude: ['tests/db/**', '**/node_modules/**'],
  },
})
