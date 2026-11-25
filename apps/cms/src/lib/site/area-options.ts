import { cache } from 'react'

import { payload } from '@/lib/site/payload'

import { buildAreaIndex, type AreaIndex, type Tree } from './area-tree'

export type { AreaIndex, AreaOption } from './area-tree'

export const getAreaIndex = cache(async (): Promise<AreaIndex> => {
  const state = await (await payload()).findGlobal({ slug: 'crm-state', depth: 0, overrideAccess: true })
  return buildAreaIndex((state.locationTree ?? {}) as Tree)
})
