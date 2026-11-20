// Mirrors scripts/e2e-seed.ts.
const PASSWORD = 'e2e-password-123'
export const USERS = {
  admin: { email: 'e2e-jong@example.test', password: PASSWORD },
  lock: { email: 'e2e-lock@example.test', password: PASSWORD },
  editor: { email: 'e2e-editor@example.test', password: PASSWORD },
}
/** The login-form user for a browser project (its own sessions; see e2e-seed.ts). */
export const uiUser = (project: string) => ({ email: `e2e-ui-${project}@example.test`, password: PASSWORD })

export const ADMIN_STATE = 'tests/e2e/.auth/admin.json'

/** The six test sizes (app PRD §11.6, §17.2). */
export const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const
