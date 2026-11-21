import { idParam, readBody } from '@/lib/api'
import { route } from '@/lib/route'
import { isFail, trashDeal, updateDeal } from '@/lib/data'
import { DEAL_INPUT_KEYS, type DealInput } from '@/lib/deals'

type P = { id: string }

/** PUT /api/deals/{id} (§14.3): replace; keeps createdAt/createdBy. 404 for unknown or deleted. */
export const PUT = route<P>(async ({ req, ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const body = await readBody(req, DEAL_INPUT_KEYS)
  if (!body) return { error: 'bad_request' }
  const out = await updateDeal(ctx, id, body as DealInput)
  return isFail(out) ? out : Response.json(out)
})

/** DELETE /api/deals/{id} (§14.3): soft delete, 200 { id }. */
export const DELETE = route<P>(async ({ ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const out = await trashDeal(ctx, id)
  return isFail(out) ? out : Response.json(out)
})
