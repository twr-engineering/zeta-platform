import { getPayload } from 'payload'

import config from '@/payload.config'

export const payload = () => getPayload({ config })

export async function getRates(): Promise<Record<string, string>> {
  const state = await (await payload()).findGlobal({ slug: 'crm-state', depth: 0 })
  return (state.currencyConverter as Record<string, string> | null) ?? {}
}
