import { idParam } from '@/lib/api'
import { route } from '@/lib/route'
import { isFail, restoreDeal } from '@/lib/data'

/** POST /api/deals/{id}/restore (§14.3): Undo a delete. 404 if it never existed or was purged. */
export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  const id = idParam(params.id)
  if (id === null) return { error: 'not_found' }
  const out = await restoreDeal(ctx, id)
  return isFail(out) ? out : Response.json(out)
})
