import { headers } from 'next/headers'
import { createLocalReq, logoutOperation, type PayloadRequest } from 'payload'

import { apiError, sameOrigin } from '@/lib/api'
import { payload } from '@/lib/payload'
import { authCookieName, sessionCookieOptions } from '@/lib/session'

/** POST /api/auth/logout (AUTH-005): ends the session on the server, clears the cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError('forbidden')
  const p = await payload()
  const { user } = await p.auth({ headers: await headers() })
  if (user) {
    // user carries its session id (_sid); logoutOperation removes just that session.
    const localReq = (await createLocalReq({ user: user as NonNullable<PayloadRequest['user']> }, p)) as PayloadRequest
    await logoutOperation({ collection: p.collections.users, req: localReq }).catch(() => undefined)
  }
  const res = new Response(null, { status: 204 })
  const opts = sessionCookieOptions(req, 0)
  res.headers.append(
    'Set-Cookie',
    [`${await authCookieName()}=`, `Path=${opts.path}`, 'Max-Age=0', 'HttpOnly', 'SameSite=Lax', opts.secure ? 'Secure' : ''].filter(Boolean).join('; '),
  )
  return res
}
