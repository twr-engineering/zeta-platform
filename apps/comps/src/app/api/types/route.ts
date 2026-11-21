import { readBody } from '@/lib/api'
import { route } from '@/lib/route'
import { createType, isFail } from '@/lib/data'

/** POST /api/types (§14.4). One transaction; 422 carries the dialog's exact copy. */
export const POST = route(async ({ req, ctx }) => {
  const body = await readBody(req, ['name', 'category', 'form'] as const)
  if (!body) return { error: 'bad_request' }
  const out = await createType(ctx, body)
  return isFail(out) ? out : Response.json(out, { status: 201 })
})
