/**
 * Run the Respacio sync once, in-process: `pnpm sync:crm`.
 * Seeds a fresh database from the golden-master fixtures when no API key is set.
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { syncRespacio } from '../src/crm/respacio/sync'

const payload = await getPayload({ config })
const result = await syncRespacio(payload)
console.log(JSON.stringify(result, null, 2))
process.exit(result.errors.length ? 1 : 0)
