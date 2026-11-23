import { cache } from 'react'

import { buildLocationMenu, type MenuLocation } from './locations-menu'
import { payload } from './payload'

/** Site Settings (header menu, footer columns, social, licence). One read per request. */
export const getSiteSettings = cache(async () => (await payload()).findGlobal({ slug: 'site-settings', depth: 1 }))

/** Published cities and barangays for the drawer's location menu (FR-G01). */
export const getLocationMenu = cache(async () => {
  const { docs } = await (await payload()).find({
    collection: 'locations',
    where: { and: [{ _status: { equals: 'published' } }, { type: { in: ['city', 'municipality', 'barangay'] } }] },
    depth: 0,
    limit: 1000,
    pagination: false,
    select: { name: true, slug: true, type: true, islandGroup: true, parent: true, breadcrumbs: true },
  })
  return buildLocationMenu(docs as unknown as MenuLocation[])
})
