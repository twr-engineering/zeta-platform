/**
 * Result-card figures. CAPTURED from the live page scripts (Simple Custom CSS and JS), applied to
 * the server's values (search-results.php:1658–1701, where an empty bedrooms/plot size becomes 0):
 *  - 297342.js  `.dash-value`: "0", "0.00" or "" → "-" (bedrooms, bathrooms, floor, lot).
 *  - 298806.js  `.sqnum` (floor area): NaN/0 → "-"; ≥10000 → toFixed(0)+"k"; ≥1000 → toFixed(1)+"k"
 *               (keeps ".0": 1000 → "1.0k"); otherwise Math.round.
 *  - 285108.js  `.plotsize` (lot area): commas stripped; NaN → "-"; ≥1000 → toFixed(1)+"k" with a
 *               trailing ".0" removed (1000 → "1k", 12345 → "12.3k"); ≥100 with decimals → round;
 *               otherwise the parsed number.
 * The two scripts disagree on floor vs lot formatting; both are reproduced as-is.
 */
type Raw = number | string | null | undefined

const isDashed = (v: Raw) => {
  const s = v == null ? '' : String(v).trim()
  return s === '' || s === '0' || s === '0.00'
}

/** JS toFixed half-up on the decimal string, which is what these scripts see. */
const fixed = (n: number, d: number) => n.toFixed(d)

export function cardCount(v: Raw): string {
  return isDashed(v) ? '-' : String(v).trim()
}

export function cardFloorArea(v: Raw): string {
  if (isDashed(v)) return '-'
  const n = Number.parseFloat(String(v).trim())
  if (Number.isNaN(n) || n === 0) return '-'
  if (n >= 10000) return `${fixed(n / 1000, 0)}k`
  if (n >= 1000) return `${fixed(n / 1000, 1)}k`
  return String(Math.round(n))
}

export function cardLotArea(v: Raw): string {
  if (isDashed(v)) return '-'
  const n = Number.parseFloat(String(v).replace(/,/g, ''))
  if (Number.isNaN(n)) return '-'
  if (n >= 1000) {
    const k = fixed(n / 1000, 1)
    return k.endsWith('.0') ? `${k.slice(0, -2)}k` : `${k}k`
  }
  if (n >= 100 && n % 1 !== 0) return String(Math.round(n))
  return String(n)
}

/**
 * Card ribbons (customtemplates 276562 "Custom Property Grid Template – 4"): one per template key,
 * in template order, printed when the listing's English marketing feature has that key
 * (label lower-cased, spaces → "_"; single-property-view.php:530–541). "Foreclosed" and
 * "Preselling" have no key in this template (it expects `is_foreclosed`), so they never show.
 */
export const CARD_RIBBON_KEYS = ['zeta_exclusive', 'price_changed', 'new', 'hot_deals', 'rush_sale', 'direct_listing', 'newly_listed', 'is_foreclosed'] as const

export function cardRibbons(marketingFeaturesEn: string | null | undefined): string[] {
  const byKey = new Map<string, string>()
  for (const label of (marketingFeaturesEn ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    byKey.set(label.toLowerCase().replace(/ /g, '_'), label)
  }
  return CARD_RIBBON_KEYS.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []))
}

/**
 * Template 276562 `.subtype`: `<span class="subsub_type remove_[remove_sub_type nempty]_">[subsub_type]</span>
 * <span class="sub_type remove_[remove_sub_type]_">[sub_type]</span>` — the sub-sub type is removed
 * whenever a sub type exists, so the card shows the sub type, else the sub-sub type. Verified on
 * production 24 Nov 2026: "House" (not "Single Detached"), "Commercial" (not "Commercial Lot").
 */
export function cardTypeLabel(subType: string | null | undefined, subSubType: string | null | undefined): string {
  return (subType ?? '').trim() || (subSubType ?? '').trim()
}
