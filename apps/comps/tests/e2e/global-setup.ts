import { execSync } from 'node:child_process'

// Test users, then the Appendix D sample set (dev/CI databases only; both scripts refuse production).
export default function globalSetup() {
  const cwd = new URL('../..', import.meta.url).pathname
  execSync('node --env-file-if-exists=.env --import tsx scripts/e2e-seed.ts', { stdio: 'inherit', cwd })
  execSync('node --env-file-if-exists=.env --import tsx scripts/seed-sample.ts --reset', {
    stdio: 'inherit',
    cwd,
    env: { ...process.env, ADMIN_EMAIL: 'e2e-jong@example.test' },
  })
}
