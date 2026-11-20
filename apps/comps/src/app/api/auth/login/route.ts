import { createLocalReq, logoutOperation, type PayloadRequest } from 'payload'

import { apiError, readBody, sameOrigin } from '@/lib/api'
import { LOGIN_COPY as MSG } from '@/lib/copy'
import { payload } from '@/lib/payload'
import { authCookieName, hasCompsAccess, sessionCookieOptions, SESSION_SECONDS } from '@/lib/session'
import type { User } from '@zeta/cms-config/types'


/** POST /api/auth/login (app PRD §14.2, AUTH-003, AUTH-004). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError('forbidden')
  const body = await readBody(req, ['email', 'password'] as const)
  if (!body) return apiError('bad_request')
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return apiError('validation', MSG.empty, !email ? 'email' : 'password')

  const p = await payload()
  // AUTH-004: 5 failed tries lock the account for 15 minutes (Payload's maxLoginAttempts /
  // lockTime). A try made while it is locked is refused with 429. The failure that triggers the
  // lock is still answered as a wrong password, so the 6th try is the first 429, as specified.
  if (await isLocked(p, email)) return apiError('rate_limited', MSG.locked)
  try {
    const result = await p.login({ collection: 'users', data: { email, password } })
    const user = result.user as User
    if (!hasCompsAccess(user) || !result.token) {
      // Valid CMS staff without Comps access: drop the session that login just created and
      // answer exactly as for a wrong password, so the endpoint says nothing about the account.
      const localReq = (await createLocalReq({ user: { ...user, collection: 'users' } as NonNullable<PayloadRequest['user']> }, p)) as PayloadRequest
      await logoutOperation({ collection: p.collections.users, req: localReq, allSessions: false }).catch(() => undefined)
      return apiError('invalid_credentials', MSG.wrong)
    }
    const res = Response.json({ user: { id: user.id, name: user.name || 'Jong', email: user.email } })
    const opts = sessionCookieOptions(req, SESSION_SECONDS)
    const cookie = [
      `${await authCookieName()}=${result.token}`,
      `Path=${opts.path}`,
      `Max-Age=${opts.maxAge}`,
      'HttpOnly',
      'SameSite=Lax',
      opts.secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ')
    res.headers.append('Set-Cookie', cookie)
    return res
  } catch (e) {
    // Payload answers a wrong password (and a lock it just applied) with a 401 APIError. The
    // error class cannot be checked reliably here (minified names, and the route can hold a
    // different copy of Payload's classes than the one that threw), so go by status.
    if ((e as { status?: number })?.status === 401) return apiError('invalid_credentials', MSG.wrong)
    // Class and message only: never the request body (NFR-011, no passwords or tokens in logs).
    console.error('login failed:', (e as Error)?.constructor?.name, (e as Error)?.message)
    return apiError('server')
  }
}

async function isLocked(p: Awaited<ReturnType<typeof payload>>, email: string): Promise<boolean> {
  const found = await p.find({
    collection: 'users',
    where: { email: { equals: email.toLowerCase() } },
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true,
    depth: 0,
  })
  const lockUntil = (found.docs[0] as { lockUntil?: string | null } | undefined)?.lockUntil
  return Boolean(lockUntil && new Date(lockUntil).getTime() > Date.now())
}
