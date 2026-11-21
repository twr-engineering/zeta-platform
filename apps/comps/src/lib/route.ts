import 'server-only'

import { apiError, sameOrigin } from './api'
import type { Ctx, Fail } from './data'
import { payload } from './payload'
import { getSessionUser } from './session'

/**
 * Wraps a signed-in route: session check (401), Origin check on writes (403), a returned
 * Fail mapped to §14.1, and anything thrown logged and answered as 500 `server`.
 */
export function route<P = Record<string, string>>(
  fn: (ctx: { req: Request; ctx: Ctx; params: P }) => Promise<Response | Fail>,
) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    if (req.method !== 'GET' && !sameOrigin(req)) return apiError('forbidden')
    const user = await getSessionUser()
    if (!user) return apiError('unauthenticated')
    try {
      const out = await fn({ req, ctx: { payload: await payload(), user: user.raw }, params: await params })
      return out instanceof Response ? out : apiError(out.error, out.message, out.field)
    } catch (e) {
      console.error(`[comps] ${req.method} ${new URL(req.url).pathname} failed:`, e instanceof Error ? `${e.name}: ${e.message}` : e)
      return apiError('server')
    }
  }
}
