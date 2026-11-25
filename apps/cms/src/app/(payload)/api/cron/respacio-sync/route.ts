import { timingSafeEqual } from 'node:crypto'

import { syncRespacioStep } from '@zeta/cms-config/respacio/sync'

import { payload } from '@/lib/site/payload'

/**
 * GET /api/cron/respacio-sync — one step of the Respacio mirror sync (CRM → Listings). Called
 * every 10 minutes by the Supabase scheduler (pg_cron + pg_net) with `Authorization: Bearer
 * $CRON_SECRET`; a cycle spans several calls (sync.ts explains why). No session: the cron secret
 * is the only way in.
 */
export const dynamic = 'force-dynamic'
// Vercel's ceiling on this plan; a step stops starting new list pages after STEP_BUDGET_MS.
export const maxDuration = 300
const STEP_BUDGET_MS = 200_000

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!authorized(req.headers.get('authorization'))) return Response.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const step = await syncRespacioStep(await payload(), { budgetMs: STEP_BUDGET_MS })
    const { cursor, ...summary } = step
    console.info(`[respacio] sync step: ${JSON.stringify({ ...summary, at: cursor ? `${cursor.pfIndex}/${cursor.offset}` : 'cycle done' })}`)
    return Response.json({ ...summary, position: cursor ? { propertyForIndex: cursor.pfIndex, offset: cursor.offset, seen: cursor.seen.length } : null }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('[respacio] sync step failed:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    return Response.json({ error: 'sync step failed' }, { status: 500 })
  }
}
