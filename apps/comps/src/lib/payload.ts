import 'server-only'

import config from '@payload-config'
import { getPayload } from 'payload'

/** The Payload Local API for Comps route handlers (Tier 1, client-apps/comps.md C2). */
export const payload = () => getPayload({ config })
