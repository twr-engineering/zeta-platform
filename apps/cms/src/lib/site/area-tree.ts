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

export type Complex = { complex_id: string; complex_name: string }
type Town = { city_id: string; city_name: string; complex_array?: Many<Complex> }
type Municipality = { municipality_id: string; municipality_name: string; city_array?: Many<Town> }
/**
 * The live API serialises PHP arrays: a list when its keys are 0..n, an object keyed by id
 * otherwise ({"3": {...}}). Every level may be either (production, 25 Nov 2026).
 */
type Many<T> = T[] | Record<string, T> | null | undefined
export type Tree = { data?: Many<{ municipality_array?: Many<Municipality> }> }

const many = <T,>(v: Many<T>): T[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])
const byName = (k: string) => (a: Record<string, unknown>, b: Record<string, unknown>) => String(a[k] ?? '').localeCompare(String(b[k] ?? ''))

export type AreaIndex = {
  options: AreaOption[]
  municipality: Record<string, string>
  town: Record<string, { name: string; municipality: string }>
  complex: Record<string, string>
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')

/** The picker options and name lookups for a CRM location tree (pure: tested on both shapes). */
export function buildAreaIndex(tree: Tree): AreaIndex {
  const index: AreaIndex = { options: [], municipality: {}, town: {}, complex: {} }
  const munis = many(tree.data).flatMap((p) => many(p.municipality_array)).filter((m) => m?.municipality_id && m.municipality_name)
  // Live order: municipalities by name (data-sort "2{name}"), each followed by its barangays and
  // their developments by name.
  for (const m of [...munis].sort(byName('municipality_name'))) {
    const mName = decode(m.municipality_name)
    index.municipality[m.municipality_id] = mName
    index.options.push({ value: `municipality_${m.municipality_id}`, label: mName, level: 'municipality', group: mName, parent: null })
    for (const t of many(m.city_array).filter((x) => x?.city_id && x.city_name).sort(byName('city_name'))) {
      const tName = decode(t.city_name)
      index.town[t.city_id] = { name: tName, municipality: mName }
      index.options.push({ value: `city_${t.city_id}`, label: tName, level: 'barangay', group: mName, parent: `municipality_${m.municipality_id}` })
      for (const c of many(t.complex_array).filter((x) => x?.complex_id && x.complex_name).sort(byName('complex_name'))) {
        const cName = decode(c.complex_name)
        index.complex[c.complex_id] = cName
        index.options.push({ value: `complexname_${c.complex_id}`, label: cName, level: 'development', group: mName, parent: `city_${t.city_id}` })
      }
    }
  }
  return index
}
