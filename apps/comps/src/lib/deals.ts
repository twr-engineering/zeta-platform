/**
 * Deal rules shared by the add form and the deal API (app PRD §8.4, §8.6, §8.9, §8.10,
 * Appendix A.7). Pure functions only: the server runs the same checks, in the same order,
 * with the same messages, as the browser (ADD-002), and builds the same record (§8.6.4).
 */
import { peso } from './format'
import { zetaCode } from './listing'
import { median, MIN_DEALS } from './stats'
import { parsePin, pinOk, type Category, type Form, type Kind } from './settings'

// ---------- input ----------

/** The deal input of §14.3, as the form sends it (strings as typed, ticks as booleans). */
export type DealInput = {
  locationId?: number | string | null
  legacyLocationName?: string | null
  typeId?: number | string | null
  legacyTypeName?: string | null
  pin?: string | null
  details?: string | null
  area?: number | string | null
  lotArea?: number | string | null
  frontage?: number | string | null
  price?: number | string | null
  date?: string | null
  codeOrLink?: string | null
  note?: string | null
  corner?: boolean | null
  ridgeView?: boolean | null
  terrain?: string | null
  cond?: string | null
  year?: number | string | null
  floor?: number | string | null
  furn?: string | null
  beds?: number | string | null
  baths?: number | string | null
  parking?: number | string | null
  parkIncl?: string | null
  storeys?: number | string | null
  fin?: string | null
  asking?: number | string | null
  dom?: number | string | null
}

export const DEAL_INPUT_KEYS = [
  'locationId', 'legacyLocationName', 'typeId', 'legacyTypeName', 'pin', 'details', 'area', 'lotArea', 'frontage', 'price', 'date',
  'codeOrLink', 'note', 'corner', 'ridgeView', 'terrain', 'cond', 'year', 'floor', 'furn', 'beds', 'baths', 'parking', 'parkIncl',
  'storeys', 'fin', 'asking', 'dom',
] as const satisfies readonly (keyof DealInput)[]

// ---------- option lists (§8.9, §8.10): [stored value, label] ----------

export type Opt = readonly [string, string]
export const FIN_OPTS: Opt[] = [
  ['Cash', 'Cash'],
  ['Bank loan', 'Bank financing'],
  ['Pag-IBIG', 'Pag-IBIG financing'],
  ['In-house or developer financing', 'In-house financing'],
  ['Other', 'Other'],
]
export const FURN_OPTS: Opt[] = [
  ['Furnished', 'Fully furnished'],
  ['Semi-furnished', 'Semi-furnished'],
  ['Unfurnished', 'Bare'],
]
export const COND_OPTS: Opt[] = [
  ['Brand new', 'Brand new'],
  ['Good', 'Good'],
  ['Needs repair', 'Needs repair'],
]
export const TERRAINS = ['Flat', 'Sloped', 'Irregular'] as const
export const PARK_INCL_OPTS: Opt[] = [
  ['Included', 'Yes, included'],
  ['Separate', 'No, sold separately'],
]
export const bedOpts = (condo: boolean): Opt[] => [
  ...(condo ? ([['0', 'Studio']] as Opt[]) : []),
  ['1', '1 bedroom'],
  ['2', '2 bedrooms'],
  ['3', '3 bedrooms'],
  ['4', '4 bedrooms'],
  ['5', '5 or more'],
]
export const BATH_OPTS: Opt[] = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 or more']]
export const PARKING_OPTS: Opt[] = [['0', 'None'], ['1', '1'], ['2', '2'], ['3', '3 or more']]
export const STOREY_OPTS: Opt[] = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4 or more']]

// ---------- type capabilities (§8.4) ----------

export type TypeInfo = { form: Form; category: Category }
/** A type not in Settings prices as a Residential house. */
export const LEGACY_TYPE: TypeInfo = { form: 'house', category: 'Residential' }

export const hasRooms = (t: TypeInfo) => t.form === 'condo' || (t.form === 'house' && t.category === 'Residential')
export const hasParking = (t: TypeInfo) => t.form === 'house' || t.form === 'condo'
export const hasFurnish = (t: TypeInfo) => (t.form === 'house' || t.form === 'condo') && (t.category === 'Residential' || t.category === 'Commercial')

// ---------- parsing (§8.6.1–8.6.2) ----------

/** Money: everything but digits and the point removed. "₱21,500,000" → 21500000. */
export const digits = (s: unknown): number => {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : NaN
}
const float = (v: unknown): number => (typeof v === 'number' ? v : parseFloat(String(v ?? '')))
const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
const int = (v: unknown): number | null => (blank(v) ? null : typeof v === 'number' ? Math.trunc(v) : parseInt(String(v), 10))
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** `normBL()`: lower case, only a to z and 0 to 9. "B22 L27" and "b22-l27" → "b22l27". */
export const normBL = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** "21,500,000" (whole pesos with commas), or the text unchanged when it has no amount (on blur). */
export const commas = (s: string): string => {
  const n = digits(s)
  return n > 0 ? Math.round(n).toLocaleString('en-US') : s
}

// ---------- validation (§8.6.3) ----------

export const DEAL_COPY = {
  pinParse: 'Enter the pin as latitude, longitude, for example 8.48930, 124.66200, or click the map.',
  pinOut: 'That pin is outside Cagayan de Oro. Check that latitude comes first and longitude second.',
  noLocation: 'Choose the subdivision or area.',
  detailsCondo: 'Enter the property details, such as the tower and unit number.',
  detailsOther: 'Enter the property details, such as the block and lot. It is how you trace the deal back to ERP213 and spot a deal entered twice.',
  areaMissing: (lot: boolean) => `Enter the ${lot ? 'lot' : 'floor'} area in sqm.`,
  areaRange: (lot: boolean) => `Check the ${lot ? 'lot' : 'floor'} area. It should be between 10 and 1,000,000 sqm.`,
  lotAreaMissing: 'Enter the lot area in sqm, from the title.',
  frontageRange: 'Check the frontage. It should be between 1 and 2,000 metres.',
  frontageNeeded: 'A lot outside a subdivision needs its frontage in metres.',
  priceMissing: 'Enter the sold price. Only enter it if you know it is accurate.',
  duplicate: (details: string) =>
    `This looks like a deal already saved: same location, ${details} and sold price. Check the deal list before adding it again.`,
  dateMissing: 'Enter the date sold.',
  dateFuture: 'The date sold is in the future.',
  dateOld: 'Check the date sold. Deals from before 2000 are too old to use as comps.',
  ppOff: (pp: number) => `That works out to ${peso(pp)} per sqm, which looks wrong. Check the area and the sold price.`,
  dom: 'Check the days on market. It should be between 0 and 3,650.',
  asking: 'The asking price looks far below the sold price. Check both numbers.',
  year: 'Check the year built.',
  floor: 'Check the floor level.',
  link: 'That link does not look right. Paste the full address, or type a listing code such as ZTP777.',
  saveFailed: 'The deal could not be saved. Check your connection and try again.',
  saved: (loc: string, pp: number) => `Deal saved: ${loc}, ${peso(pp)} per sqm`,
  updated: (loc: string, pp: number) => `Deal updated: ${loc}, ${peso(pp)} per sqm`,
  missing: 'That deal is no longer saved.',
} as const

/** Keys of the identity of a place or type for comparisons: `id:5`, or `name:Old Road` for a name not in Settings. */
export const refKey = (r: { id: number | string | null; name: string }) => (r.id !== null && r.id !== undefined ? `id:${r.id}` : `name:${r.name}`)

export type DupCandidate = { id: number | string; locKey: string; details: string | null; price: number }

export type CheckCtx = {
  /** The chosen place's kind; '' for a name not in Settings; null when nothing is chosen. */
  kind: Kind | '' | null
  type: TypeInfo
  /** The chosen place's refKey, for the duplicate check. */
  locKey: string
  /** Live (not deleted) deals to check for a duplicate. */
  others: DupCandidate[]
  editId?: number | string | null
  /** Today in Asia/Manila, YYYY-MM-DD. */
  today: string
}

export type DealError = { field: string; message: string }

/** Runs §8.6.3 in order and returns the first failure (field = the request key), or null. */
export function checkDeal(input: DealInput, ctx: CheckCtx): DealError | null {
  const fail = (field: string, message: string): DealError => ({ field, message })
  const { type, kind } = ctx
  const lot = type.form === 'lot'
  const pin = parsePin(input.pin)
  if (!pin) return fail('pin', DEAL_COPY.pinParse)
  if (!pinOk(pin)) return fail('pin', DEAL_COPY.pinOut)
  if (kind === null) return fail('locationId', DEAL_COPY.noLocation)
  const details = text(input.details).trim()
  if (!details && kind === 'Subdivision') return fail('details', type.form === 'condo' ? DEAL_COPY.detailsCondo : DEAL_COPY.detailsOther)
  const area = float(input.area)
  if (!(area > 0)) return fail('area', DEAL_COPY.areaMissing(lot))
  if (area < 10 || area > 1_000_000) return fail('area', DEAL_COPY.areaRange(lot))
  if (type.form === 'house') {
    const lotArea = float(input.lotArea)
    if (!(lotArea > 0)) return fail('lotArea', DEAL_COPY.lotAreaMissing)
    if (lotArea < 10 || lotArea > 1_000_000) return fail('lotArea', DEAL_COPY.areaRange(true))
  }
  const front = float(input.frontage)
  if (front && (front < 1 || front > 2000)) return fail('frontage', DEAL_COPY.frontageRange)
  if (lot && kind === 'Zone' && !(front > 0)) return fail('frontage', DEAL_COPY.frontageNeeded)
  const price = digits(input.price)
  if (!(price > 0)) return fail('price', DEAL_COPY.priceMissing)
  if (details) {
    const key = normBL(details)
    const whole = Math.round(price)
    const dup = ctx.others.some(
      (d) => String(d.id) !== String(ctx.editId ?? '') && d.locKey === ctx.locKey && !!d.details && normBL(d.details) === key && d.price === whole,
    )
    if (dup) return fail('details', DEAL_COPY.duplicate(details))
  }
  const date = text(input.date).trim()
  if (!date) return fail('date', DEAL_COPY.dateMissing)
  if (date > ctx.today) return fail('date', DEAL_COPY.dateFuture)
  if (date < '2000-01-01') return fail('date', DEAL_COPY.dateOld)
  const pp = price / area
  if (pp < 100 || pp > 1_000_000) return fail('price', DEAL_COPY.ppOff(pp))
  const dom = int(input.dom)
  if (dom !== null && (Number.isNaN(dom) || dom < 0 || dom > 3650)) return fail('dom', DEAL_COPY.dom)
  const asking = digits(input.asking)
  if (asking && asking < price * 0.5) return fail('asking', DEAL_COPY.asking)
  if (type.form === 'house') {
    const year = int(input.year)
    const next = Number(ctx.today.slice(0, 4)) + 1
    if (year !== null && (Number.isNaN(year) || year < 1900 || year > next)) return fail('year', DEAL_COPY.year)
  }
  if (type.form === 'condo') {
    const floor = int(input.floor)
    if (floor !== null && (Number.isNaN(floor) || floor < 1 || floor > 100)) return fail('floor', DEAL_COPY.floor)
  }
  const raw = text(input.codeOrLink).trim()
  if (/^https?:\/\//i.test(raw) && !zetaCode(raw)) {
    try {
      new URL(raw)
    } catch {
      return fail('codeOrLink', DEAL_COPY.link)
    }
  }
  return null
}

// ---------- the saved record (§8.6.4) ----------

/** Every value column of a deal, as stored (Payload field names). Fields that do not apply are null. */
export type DealRecord = {
  area: number
  price: number
  dateSold: string
  lat: number
  lng: number
  corner: boolean
  code: string | null
  link: string | null
  details: string | null
  note: string | null
  fin: 'Cash' | 'Bank loan' | 'Pag-IBIG' | 'In-house or developer financing' | 'Other' | null
  frontage: number | null
  asking: number | null
  dom: number | null
  terrain: (typeof TERRAINS)[number] | null
  view: 'Ridge view' | null
  cond: 'Brand new' | 'Good' | 'Needs repair' | null
  yearBuilt: number | null
  floor: number | null
  furn: 'Furnished' | 'Semi-furnished' | 'Unfurnished' | null
  lotArea: number | null
  storeys: number | null
  beds: number | null
  baths: number | null
  parking: number | null
  parkIncl: 'Included' | 'Separate' | null
}

/** Builds the record from input that passed checkDeal(). Fields that do not apply to the type are never saved. */
export function buildRecord(input: DealInput, type: TypeInfo): DealRecord {
  const lot = type.form === 'lot'
  const house = type.form === 'house'
  const condo = type.form === 'condo'
  const pin = parsePin(input.pin)!
  const pick = <T extends string>(v: unknown): T | null => (blank(v) ? null : (String(v) as T))

  let code: string | null = null
  let link: string | null = null
  const raw = text(input.codeOrLink).trim()
  if (zetaCode(raw)) code = zetaCode(raw)
  else if (/^https?:\/\//i.test(raw)) link = new URL(raw).href
  else if (raw) code = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '') || null

  const note = text(input.note).trim().replace(/\s+/g, ' ').slice(0, 300)
  const front = float(input.frontage)
  const asking = digits(input.asking)
  const dom = int(input.dom)
  const year = int(input.year)
  const floor = int(input.floor)
  const parking = hasParking(type) ? int(input.parking) : null
  const parkIncl = condo && parking !== 0 ? pick<'Included' | 'Separate'>(input.parkIncl) : null

  return {
    area: float(input.area),
    price: Math.round(digits(input.price)),
    dateSold: text(input.date).trim(),
    lat: pin.lat,
    lng: pin.lng,
    corner: lot ? !!input.corner : false,
    code,
    link,
    details: text(input.details).trim() || null,
    note: note || null,
    fin: pick(input.fin),
    frontage: lot && front > 0 ? front : null,
    asking: asking > 0 ? Math.round(asking) : null,
    dom: dom !== null && dom >= 0 ? dom : null,
    terrain: lot ? pick(input.terrain) : null,
    view: lot && input.ridgeView ? 'Ridge view' : null,
    cond: house ? pick(input.cond) : null,
    yearBuilt: house ? year : null,
    floor: condo ? floor : null,
    furn: hasFurnish(type) ? pick(input.furn) : null,
    lotArea: house ? float(input.lotArea) : null,
    storeys: house ? int(input.storeys) : null,
    beds: hasRooms(type) ? int(input.beds) : null,
    baths: hasRooms(type) ? int(input.baths) : null,
    parking,
    parkIncl,
  }
}

/**
 * The API's shape check before the rules (§14.1 400 `bad_request`): every value has the type
 * the form sends, and every choice is one of its list. The UI can never send anything else.
 */
export function inputShapeOk(b: Record<string, unknown>): boolean {
  const isText = (v: unknown) => v === undefined || v === null || typeof v === 'string'
  const isNum = (v: unknown) => v === undefined || v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))
  const isBool = (v: unknown) => v === undefined || v === null || typeof v === 'boolean'
  const isId = (v: unknown) => v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && /^\d{0,12}$/.test(v))
  const oneOf = (v: unknown, opts: readonly string[]) => blank(v) || opts.includes(String(v))
  const vals = (o: Opt[]) => o.map((x) => x[0])
  return (
    isId(b.locationId) && isId(b.typeId) &&
    ['legacyLocationName', 'legacyTypeName', 'pin', 'details', 'date', 'codeOrLink', 'note'].every((k) => isText(b[k])) &&
    ['area', 'lotArea', 'frontage', 'price', 'year', 'floor', 'asking', 'dom'].every((k) => isNum(b[k])) &&
    isBool(b.corner) && isBool(b.ridgeView) &&
    ['terrain', 'cond', 'furn', 'parkIncl', 'fin', 'beds', 'baths', 'parking', 'storeys'].every((k) => isText(b[k]) || isNum(b[k])) &&
    oneOf(b.terrain, TERRAINS) && oneOf(b.cond, vals(COND_OPTS)) && oneOf(b.furn, vals(FURN_OPTS)) &&
    oneOf(b.parkIncl, vals(PARK_INCL_OPTS)) && oneOf(b.fin, vals(FIN_OPTS)) && oneOf(b.beds, vals(bedOpts(true))) &&
    oneOf(b.baths, vals(BATH_OPTS)) && oneOf(b.parking, vals(PARKING_OPTS)) && oneOf(b.storeys, vals(STOREY_OPTS))
  )
}

// ---------- preview (§7.4.4) ----------

export type Preview =
  | { kind: 'empty' }
  | { kind: 'value'; pp: number; median: number | null; n: number; dev: number | null; warn: boolean }

/** `peers`: price per sqm of the closed deals at the same location and type (the edited deal left out). */
export function preview(area: number, price: number, located: boolean, peers: number[]): Preview {
  if (!(area > 0) || !(price > 0)) return { kind: 'empty' }
  const pp = price / area
  if (!located || peers.length < MIN_DEALS) return { kind: 'value', pp, median: null, n: peers.length, dev: null, warn: false }
  const med = median(peers)
  const dev = ((pp - med) / med) * 100
  return { kind: 'value', pp, median: med, n: peers.length, dev, warn: Math.abs(dev) > 35 }
}

export const previewWarning = (dev: number, med: number) =>
  ({ strong: `${Math.abs(dev).toFixed(0)}% ${dev > 0 ? 'above' : 'below'}`, rest: ` the middle price of ${peso(med)}. Check the area and price.` }) as const

// ---------- location suggestion (§7.4.2) ----------

export type Suggestion = { key: string; dist: number }

/** The nearest candidate (place centers and deal pins, each carrying its place key), or null. */
export function nearestPlace(pin: { lat: number; lng: number }, candidates: { key: string; lat: number; lng: number }[], dist: (a: typeof pin, b: typeof pin) => number): Suggestion | null {
  let best: Suggestion | null = null
  for (const c of candidates) {
    const d = dist(pin, c)
    if (!best || d < best.dist) best = { key: c.key, dist: d }
  }
  return best
}

/** The select value and hint for a suggestion (the three distance bands). */
export function suggestionHint(s: Suggestion | null): { key: string; hint: string; warn: boolean } {
  const tail = ', or add a new one at the end of the list'
  if (s && s.dist <= 500) return { key: s.key, hint: 'suggested from the pin, change it if wrong', warn: false }
  if (s && s.dist <= 1500) return { key: s.key, hint: `nearest saved place is ${(s.dist / 1000).toFixed(1)} km away, check it is right${tail}`, warn: true }
  return { key: '', hint: `no saved place near the pin, choose one${tail}`, warn: true }
}
