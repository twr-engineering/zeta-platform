import { idParam, readBody } from '@/lib/api'
import { route } from '@/lib/route'
import { deleteLocation, updateLocation, isFail } from '@/lib/data'

type P = { id: string }

/** PATCH /api/locations/{id} (§14.4): any of the keys; answers with dealsMoved for a rename. */
export const PATCH = route<P>(async ({ req, ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const body = await readBody(req, ['name', 'kind', 'center', 'hidden'] as const)
  if (!body) return { error: 'bad_request' }
  const out = await updateLocation(ctx, id, body)
  return isFail(out) ? out : Response.json(out)
})

/** DELETE /api/locations/{id} (§14.4): 204, or 409 while used, last, or last shown. */
export const DELETE = route<P>(async ({ ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const out = await deleteLocation(ctx, id)
  return isFail(out) ? out : new Response(null, { status: 204 })
})
