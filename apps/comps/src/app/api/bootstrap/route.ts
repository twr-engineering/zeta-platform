import { route } from '@/lib/route'
import { loadBootstrap } from '@/lib/data'

/** GET /api/bootstrap (§14.3): user, Settings lists with deal counts, and every non-deleted deal. */
export const GET = route(async ({ ctx }) => Response.json(await loadBootstrap(ctx), { headers: { 'cache-control': 'no-store' } }))
