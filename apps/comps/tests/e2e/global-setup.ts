import { execSync } from 'node:child_process'

export default function globalSetup() {
  execSync('node --env-file-if-exists=.env --import tsx scripts/e2e-seed.ts', { stdio: 'inherit', cwd: new URL('../..', import.meta.url).pathname })
}
