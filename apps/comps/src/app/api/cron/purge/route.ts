import { payload } from '@/lib/payload'
import { apiError } from '@/lib/api'
import { cronAuthorized, runPurge } from '@/lib/purge'

/**
 * GET /api/cron/purge: Vercel Cron, nightly at 19:00 UTC (03:00 Asia/Manila), see vercel.json.
 * Permanently deletes closed deals trashed more than 30 days ago (comps.md C10, app PRD Q5).
 * No session: the cron secret is the only way in.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get('authorization'))) return apiError('unauthenticated')
  try {
    const result = await runPurge(await payload())
    console.info(`[comps] nightly purge: ${result.purged} deal(s) removed`)
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('[comps] nightly purge failed:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    return apiError('server')
  }
}
