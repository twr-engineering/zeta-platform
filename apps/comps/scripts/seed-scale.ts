/**
 * Performance harness (app PRD NFR-001..003): adds synthetic closed deals until the table holds
 * `--total` (default 20,000), spread over every place and type, all inside the database rules.
 * Development and test only: refuses APP_ENV=production or an unset APP_ENV (NFR-008 rule).
 * Bulk SQL, not the API, because 20,000 single-deal transactions would take minutes; the rows still
 * pass every database check (DATA-001). Usage: pnpm seed:scale [--total 20000]
 */
import config from '@payload-config'
import { getPayload } from 'payload'
if (process.env.APP_ENV === 'production' || !process.env.APP_ENV) {
  console.error('seed:scale refuses to run without APP_ENV, or with APP_ENV=production.')
  process.exit(1)
}

const arg = process.argv.indexOf('--total')
const TOTAL = arg > 0 ? Number(process.argv[arg + 1]) : 20_000

const payload = await getPayload({ config })
// The adapter's own pg pool, with parameterized queries (no extra dependency for a test harness).
type Pool = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
const pool = (payload.db as unknown as { pool: Pool }).pool

const count = Number((await pool.query('select count(*)::int as n from "cms"."comps_deals" where "deleted_at" is null')).rows[0].n)
const admin = (await pool.query('select id from "cms"."users" order by id limit 1')).rows[0]?.id
const places = (await pool.query('select id, lat, lng from "cms"."comps_locations"')).rows as { id: number; lat: string; lng: string }[]
const types = (await pool.query('select id, form from "cms"."comps_property_types"')).rows as { id: number; form: 'lot' | 'house' | 'condo' }[]
if (!admin || !places.length || !types.length) {
  console.error('seed:scale needs seed:admin (and the default lists) first.')
  process.exit(1)
}

const need = Math.max(0, TOTAL - count)
// A deterministic generator, so repeated runs make the same data.
let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
const today = new Date(Date.now() + 8 * 3600_000)

for (let done = 0; done < need; ) {
  const batch = Math.min(1000, need - done)
  const values: unknown[] = []
  const tuples: string[] = []
  for (let i = 0; i < batch; i++) {
    const p = pick(places)
    const t = pick(types)
    const area = t.form === 'condo' ? 25 + Math.floor(rnd() * 120) : t.form === 'house' ? 60 + Math.floor(rnd() * 400) : 150 + Math.floor(rnd() * 1500)
    const pp = t.form === 'condo' ? 90_000 + rnd() * 60_000 : t.form === 'house' ? 40_000 + rnd() * 50_000 : 15_000 + rnd() * 40_000
    const days = Math.floor(rnd() * 365 * 3)
    const date = new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10)
    const row = [p.id, t.id, area, t.form === 'house' ? area + 50 + Math.floor(rnd() * 200) : null, Math.round(area * pp), date,
      Number(p.lat) + (rnd() - 0.5) * 0.01, Number(p.lng) + (rnd() - 0.5) * 0.01, 'S' + (count + done + i), false, admin, admin]
    tuples.push(`(${row.map((_, j) => `$${values.length + j + 1}`).join(', ')}, now(), now(), now())`)
    values.push(...row)
  }
  await pool.query(
    `insert into "cms"."comps_deals" ("location_id", "property_type_id", "area", "lot_area", "price", "date_sold", "lat", "lng",
      "details", "corner", "created_by_id", "edited_by_id", "edited_at", "updated_at", "created_at") values ${tuples.join(', ')}`,
    values,
  )
  done += batch
}
console.log(`seed:scale: ${count} existing + ${need} added = ${count + need} live deals.`)
process.exit(0)
