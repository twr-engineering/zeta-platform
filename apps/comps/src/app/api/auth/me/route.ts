import { apiError } from '@/lib/api'
import { getSessionUser } from '@/lib/session'

/** GET /api/auth/me (§14.2). */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError('unauthenticated')
  const { raw: _raw, ...pub } = user
  return Response.json({ user: pub })
}
