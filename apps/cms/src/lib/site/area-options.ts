import { cache } from 'react'

import { payload } from '@/lib/site/payload'

/**
 * The search location picker's options (FR-SR02 area), from the CRM location tree the sync stores
 * in crm-state (properties/province_municipality_city_complex). Same values as the live picker:
 * municipality_{id} (shown as a city), city_{id} (a barangay, under its municipality) and
 * complexname_{id} (a development, under its barangay).
 */
export type AreaOption = {
  value: string
  label: string
  level: 'municipality' | 'barangay' | 'development'
  /** The municipality this option sits under (the picker's group). */
  group: string
  parent: string | null
}

type Tree = {
  data?: {
    municipality_array?: {
      municipality_id: string
      municipality_name: string
      city_array?: { city_id: string; city_name: string; complex_array?: { complex_id: string; complex_name: string }[] }[]
    }[]
  }[]
}

export type AreaIndex = {
  options: AreaOption[]
  municipality: Record<string, string>
  town: Record<string, { name: string; municipality: string }>
  complex: Record<string, string>
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')

export const getAreaIndex = cache(async (): Promise<AreaIndex> => {
  const state = await (await payload()).findGlobal({ slug: 'crm-state', depth: 0, overrideAccess: true })
  const tree = (state.locationTree ?? {}) as Tree
  const index: AreaIndex = { options: [], municipality: {}, town: {}, complex: {} }
  const munis = (tree.data ?? []).flatMap((p) => p.municipality_array ?? [])
  // Live order: municipalities by name (data-sort "2{name}"), each followed by its barangays and
  // their developments by name.
  for (const m of [...munis].sort((a, b) => a.municipality_name.localeCompare(b.municipality_name))) {
    const mName = decode(m.municipality_name)
    index.municipality[m.municipality_id] = mName
    index.options.push({ value: `municipality_${m.municipality_id}`, label: mName, level: 'municipality', group: mName, parent: null })
    for (const t of [...(m.city_array ?? [])].sort((a, b) => a.city_name.localeCompare(b.city_name))) {
      const tName = decode(t.city_name)
      index.town[t.city_id] = { name: tName, municipality: mName }
      index.options.push({ value: `city_${t.city_id}`, label: tName, level: 'barangay', group: mName, parent: `municipality_${m.municipality_id}` })
      for (const c of [...(t.complex_array ?? [])].sort((a, b) => a.complex_name.localeCompare(b.complex_name))) {
        const cName = decode(c.complex_name)
        index.complex[c.complex_id] = cName
        index.options.push({ value: `complexname_${c.complex_id}`, label: cName, level: 'development', group: mName, parent: `city_${t.city_id}` })
      }
    }
  }
  return index
})
