import { readBody } from '@/lib/api'
import { route } from '@/lib/route'
import { createDeal, isFail, listDeals } from '@/lib/data'
import { DEAL_INPUT_KEYS, type DealInput } from '@/lib/deals'

/** GET /api/deals (§14.3): refresh the live deals, newest first. */
export const GET = route(async ({ ctx }) => Response.json(await listDeals(ctx)))

/** POST /api/deals (§14.3): 201 with the deal; 422 runs §8.6.3 in order with the form's exact copy. */
export const POST = route(async ({ req, ctx }) => {
  const body = await readBody(req, DEAL_INPUT_KEYS)
  if (!body) return { error: 'bad_request' }
  const out = await createDeal(ctx, body as DealInput)
  return isFail(out) ? out : Response.json(out, { status: 201 })
})
