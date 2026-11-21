import { idParam, readBody } from '@/lib/api'
import { route } from '@/lib/route'
import { deleteType, updateType, isFail } from '@/lib/data'

type P = { id: string }

/** PATCH /api/types/{id} (§14.4): any of the keys; answers with dealsMoved for a rename. */
export const PATCH = route<P>(async ({ req, ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const body = await readBody(req, ['name', 'category', 'form', 'hidden'] as const)
  if (!body) return { error: 'bad_request' }
  const out = await updateType(ctx, id, body)
  return isFail(out) ? out : Response.json(out)
})

/** DELETE /api/types/{id} (§14.4): 204, or 409 while used, last, or last shown. */
export const DELETE = route<P>(async ({ ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const out = await deleteType(ctx, id)
  return isFail(out) ? out : new Response(null, { status: 204 })
})
