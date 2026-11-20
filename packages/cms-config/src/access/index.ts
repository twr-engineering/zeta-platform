import type { Access, FieldAccess } from 'payload'

/**
 * Access helpers. Deny by default (ADR-9): Payload lets any logged-in user create, update
 * and delete when a rule is missing, so every collection and global states every rule.
 *
 * The public site reads through the Local API, which bypasses these rules by default
 * (overrideAccess), so they govern the REST/GraphQL APIs and the admin panel.
 */

type Role = 'admin' | 'editor'
type RoleUser = { roles?: Role[] | null } | null | undefined

const hasRole = (user: RoleUser, ...roles: Role[]): boolean =>
  Boolean(user?.roles?.some((r) => roles.includes(r)))

/** Anyone, including anonymous visitors. Only for content that is public by nature. */
export const anyone: Access = () => true

/** Nobody through the API. Writes happen via the Local API (sync, seeds, migrations). */
export const nobody: Access = () => false

/** Staff: admins and editors. */
export const isStaff: Access = ({ req: { user } }) => hasRole(user as RoleUser, 'admin', 'editor')

export const isAdmin: Access = ({ req: { user } }) => hasRole(user as RoleUser, 'admin')

/** Staff see drafts; everyone else sees published documents only. */
export const publishedOrStaff: Access = ({ req: { user } }) =>
  hasRole(user as RoleUser, 'admin', 'editor') ? true : { _status: { equals: 'published' } }

/** Admins see every user; anyone else logged in sees only themselves. Anonymous: nothing. */
export const adminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user as RoleUser, 'admin')) return true
  return { id: { equals: user.id } }
}

/** Field-level: only admins may set or change it (blocks role self-escalation). */
export const adminFieldOnly: FieldAccess = ({ req: { user } }) => hasRole(user as RoleUser, 'admin')
