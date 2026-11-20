import 'server-only'

import { headers } from 'next/headers'
import type { User } from '@zeta/cms-config/types'

import { payload } from './payload'

/** Who may use Comps: comps-admin, or a platform admin (client-apps/comps.md C4). */
export const hasCompsAccess = (user: Pick<User, 'roles'> | null | undefined): boolean =>
  Boolean(user?.roles?.some((r) => r === 'comps-admin' || r === 'admin'))

export type SessionUser = { id: number; name: string; email: string; role: 'admin' }

/** The signed-in Comps user from the session cookie, or null. Payload checks the JWT and its server-side session. */
export async function getSessionUser(): Promise<(SessionUser & { raw: User }) | null> {
  const p = await payload()
  const { user } = await p.auth({ headers: await headers() })
  if (!user || user.collection !== 'users' || !hasCompsAccess(user as User)) return null
  const u = user as User
  return { id: u.id, name: u.name || 'Jong', email: u.email, role: 'admin', raw: u }
}

/** Name of Payload's auth cookie for this config (`{cookiePrefix}-token`). */
export async function authCookieName(): Promise<string> {
  const p = await payload()
  return `${p.config.cookiePrefix}-token`
}

/**
 * Cookie options for the session (AUTH-003): httpOnly, SameSite=Lax, 30 days, Secure except
 * on plain-http localhost (development and the e2e server), where browsers would drop it.
 */
export function sessionCookieOptions(req: Request, maxAge: number) {
  const url = new URL(req.url)
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  return { httpOnly: true, sameSite: 'lax' as const, secure: !local, path: '/', maxAge }
}

export const SESSION_SECONDS = 30 * 24 * 60 * 60
