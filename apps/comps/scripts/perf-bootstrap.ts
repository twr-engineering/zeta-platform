/**
 * NFR-001/003 measurement: times the bootstrap load (the data behind GET /api/bootstrap) and
 * reports its JSON size raw, gzipped and brotli-compressed. Read-only. Usage: pnpm perf:bootstrap
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { loadBootstrap } from '../src/lib/data'

const payload = await getPayload({ config })
const admin = (await payload.find({ collection: 'users', limit: 1, sort: 'id', overrideAccess: true })).docs[0]
if (!admin) {
  console.error('perf:bootstrap needs a user (seed:admin).')
  process.exit(1)
}
await loadBootstrap({ payload, user: admin }) // warm up: connection pool, schema

const runs: number[] = []
let body = ''
for (let i = 0; i < 5; i++) {
  const t = performance.now()
  body = JSON.stringify(await loadBootstrap({ payload, user: admin }))
  runs.push(performance.now() - t)
}
const deals = (JSON.parse(body) as { deals: unknown[] }).deals.length
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`
runs.sort((a, b) => a - b)
console.log(
  JSON.stringify({
    deals,
    medianMs: Math.round(runs[2]),
    worstMs: Math.round(runs[4]),
    raw: mb(Buffer.byteLength(body)),
    gzip: mb(gzipSync(body).length),
    brotli: mb(brotliCompressSync(body).length),
  }),
)
process.exit(0)
