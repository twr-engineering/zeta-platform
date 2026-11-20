import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Against a Postgres migrated by apps/cms (DATABASE_URI). CI migrates first.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: 'node', include: ['tests/db/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
})
