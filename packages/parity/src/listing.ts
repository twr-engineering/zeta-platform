/**
 * BPM-020 — listing detail rules. CAPTURED from respacio templates/single-property-view.php (spv)
 * and the "custom property view" template (customtemplates 288102). Do not "improve".
 */

type Groups = { name?: string; [group: string]: unknown }[] | null | undefined

/** Values of a CRM group list ([{name, <name>: {id: value}}]) in payload order, with their ids. */
function entries(groups: Groups): { id: string; value: string }[] {
  const out: { id: string; value: string }[] = []
  for (const g of groups ?? []) {
    const bag = g && typeof g.name === 'string' ? g[g.name] : null
    if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
      for (const [id, value] of Object.entries(bag as Record<string, unknown>)) if (typeof value === 'string' && value !== '') out.push({ id, value })
    }
  }
  return out
}

/**
 * spv:495–516 — New Development descriptions (sale_detail_type_id 2): every `[Label: a - b]`
 * before the last "]." becomes "Label from a to b." (or "Label : a." without a second value),
 * replaced everywhere in the description.
 */
export function newDevelopmentDescription(description: string, saleDetailTypeId: string | null | undefined): string {
  if (saleDetailTypeId !== '2') return description
  const last = description.lastIndexOf('].')
  const head = description.slice(0, (last === -1 ? -1 : last) + 2) // strrpos false → substr(0, 2)
  let out = description
  for (const m of head.matchAll(/\[(.*?)\]/g)) {
    const [label, rest = ''] = m[1].split(':')
    const [a = '', b] = rest.split('-')
    const title = b !== undefined && b !== '' ? `${label} from ${a.trim()} to ${b.trim()}.` : `${label} : ${a.trim()}.`
    out = out.split(m[0]).join(title)
  }
  return out
}

export type PriceHistoryRow = { date: string; direction: 'up' | 'down'; percent: number; previous: string }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** PHP round(): half away from zero. */
const phpRound = (n: number) => Math.sign(n) * Math.round(Math.abs(n))

/**
 * spv:2169–2229 — Price History rows: date as `j M Y`; change = round(abs((new − old) / old × 100))
 * with ▲ unless the price fell; Previous Price is the raw CRM string. A row missing either price
 * is skipped. `null` means "Price history not found." (an empty list).
 */
export function priceHistoryRows(history: { price_change_date?: string; old_price?: string; new_price?: string }[] | null | undefined): PriceHistoryRow[] | null {
  if (!history || history.length === 0) return null
  const rows: PriceHistoryRow[] = []
  for (const h of history) {
    const neu = (h.new_price ?? '').replace(/[^\d.]/g, '')
    const old = (h.old_price ?? '').replace(/[^\d.]/g, '')
    if (neu === '' || old === '') continue
    const diff = Number(neu) - Number(old)
    const d = new Date(`${(h.price_change_date ?? '').slice(0, 10)}T00:00:00Z`)
    const date = Number.isNaN(d.getTime()) ? '' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    rows.push({ date, direction: diff < 0 ? 'down' : 'up', percent: phpRound(Math.abs((diff / Number(old)) * 100)), previous: h.old_price ?? '' })
  }
  return rows
}

/**
 * spv:1258–1302 — the Features list: lower-cased, de-duplicated feature values, sorted. When the
 * listing has attribute values, it is the symmetric difference instead: attribute values not among
 * the features (sorted), then feature values not among the attributes (sorted).
 */
export function featureList(attributes: Groups, features: Groups): string[] {
  const uniqSorted = (list: string[]) => [...new Set(list.map((v) => v.toLowerCase()))].sort()
  const feats = uniqSorted(entries(features).map((e) => e.value))
  const attrs = uniqSorted(entries(attributes).map((e) => e.value))
  if (!attrs.length) return feats
  return [...attrs.filter((a) => !feats.includes(a)), ...feats.filter((f) => !attrs.includes(f))]
}

/** Template 288102 Property Info attribute rows (T:487–596): label → attribute ids. */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i))
export const ATTRIBUTE_ROWS: [string, string[]][] = [
  ['Pool', ['1', '2', '3', '4', '116']],
  ['Parking', ['13', '15', '16', ...range(106, 109)]],
  ['Telecoms and Security', [...range(18, 23), '128']],
  ['Orientation', ['25', '26', '117', '118']],
  ['Exterior Features', ['30', ...range(32, 39), '112']],
  ['Decor', [...range(40, 43), ...range(47, 54)]],
  ['Rooms', [...range(69, 91), '93']],
  ['Furnishing', ['99', '100', '102', '103']],
  ['Condition', ['113', '114', '115', '124', '125']],
  ['Lot Type', [...range(119, 123), '144']],
  // 145 "Beachfront" is not in the template's View list (CD-24).
  ['View', [...range(129, 135), '137']],
  ['Is Foreclosed ?', ['142', '143']],
]

/** Each row is shown only when one of its ids is present; values come out in CRM order (spv:2805–2820). */
export function attributeRows(attributes: Groups): { label: string; values: string[] }[] {
  const all = entries(attributes)
  return ATTRIBUTE_ROWS.map(([label, ids]) => ({ label, values: all.filter((e) => ids.includes(e.id)).map((e) => e.value) })).filter((r) => r.values.length > 0)
}

/** T:51–58 — the header's marketing ribbons (8 keys; Zeta Exclusive and Preselling never show, CD-28). */
export const DETAIL_RIBBON_KEYS = ['exclusive', 'price_changed', 'new', 'hot_deals', 'rush_sale', 'direct_listing', 'newly_listed', 'is_foreclosed'] as const

/** BPM-010 — similar-properties price band: round(price ∓ price × N / 100), N = 40, PHP half-up. */
export function similarPriceBounds(price: number, n = 40): { min: number; max: number } {
  const half = (x: number) => Math.floor(x + 0.5)
  return { min: half(price - (price * n) / 100), max: half(price + (price * n) / 100) }
}
