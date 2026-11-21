import fixture from '../../scripts/fixtures/sample-deals.json' with { type: 'json' }

import type { DealJSON } from '@/lib/data'
import { bandOf, DEFAULT_LOCATIONS, DEFAULT_TYPES, type Category, type Form, type Kind } from '@/lib/settings'
import { resolveSeedDate, type SeedDate } from '@/lib/seed-dates'

/**
 * The Appendix D fixture as §14.3 deal objects, with dates resolved for a seed run on `now`
 * (D.5 was computed for 4 Nov 2026). Ids follow fixture order; refs are kept for lookups.
 */
type F = Record<string, unknown> & { ref: string; dateSold: SeedDate; loc?: string; type?: string; legacyLocationName?: string; legacyTypeName?: string }
const LOCS = [...DEFAULT_LOCATIONS, ...fixture.settings.locations].map((l, i) => ({ id: i + 1, name: l.name, kind: l.kind as Kind }))
const TYPES = [...DEFAULT_TYPES, ...fixture.settings.types].map((t, i) => ({ id: i + 1, name: t.name, form: t.form as Form, category: t.category as Category }))
export const FIXTURE_TYPES = TYPES.map((t) => ({ ...t, hidden: false, sortOrder: t.id, dealCount: 0 }))

export function fixtureDeals(now = new Date('2026-11-04T04:00:00Z')): (DealJSON & { ref: string })[] {
  return (fixture.deals as F[]).map((d, i) => {
    const loc = LOCS.find((l) => l.name === d.loc)
    const type = TYPES.find((t) => t.name === d.type)
    const n = (k: string) => (d[k] === undefined || d[k] === null ? null : Number(d[k]))
    const s = (k: string) => (d[k] === undefined || d[k] === null ? null : String(d[k]))
    const area = Number(d.area)
    const price = Number(d.price)
    return {
      ref: d.ref,
      id: i + 1,
      location: loc ? { id: loc.id, name: loc.name, kind: loc.kind } : { id: null, name: String(d.legacyLocationName), kind: '' as const },
      type: type ? { id: type.id, name: type.name, form: type.form, category: type.category } : { id: null, name: String(d.legacyTypeName), form: 'house' as Form, category: 'Residential' as Category },
      area, lotArea: n('lotArea'), price, pp: price / area, band: bandOf(area),
      date: resolveSeedDate(d.dateSold, now), lat: Number(d.lat), lng: Number(d.lng),
      details: s('details'), code: s('code'), link: s('link'), note: s('note'), frontage: n('frontage'), corner: !!d.corner,
      view: s('view') as 'Ridge view' | null, terrain: s('terrain') as 'Flat' | null, cond: s('cond') as 'Good' | null, year: n('year'), floor: n('floor'),
      furn: s('furn') as 'Furnished' | null, beds: n('beds'), baths: n('baths'), parking: n('parking'), parkIncl: s('parkIncl') as 'Included' | null,
      storeys: n('storeys'), fin: s('fin') as 'Cash' | null, asking: n('asking'), dom: n('dom'),
      createdAt: '2026-11-04T04:00:00.000Z', createdBy: 1, updatedAt: '2026-11-04T04:00:00.000Z', updatedBy: 1,
    }
  })
}
