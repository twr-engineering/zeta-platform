import { readBody } from '@/lib/api'
import { route } from '@/lib/route'
import { createLocation, isFail } from '@/lib/data'

/** POST /api/locations (§14.4). One transaction; 422 carries the dialog's exact copy. */
export const POST = route(async ({ req, ctx }) => {
  const body = await readBody(req, ['name', 'kind', 'center'] as const)
  if (!body) return { error: 'bad_request' }
  const out = await createLocation(ctx, body)
  return isFail(out) ? out : Response.json(out, { status: 201 })
})
