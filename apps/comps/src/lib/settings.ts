/**
 * Settings rules and copy shared by the browser and the API (app PRD §7.5, §13.5, §14.4,
 * Appendix A.8–A.9). Pure functions only: the server runs the same checks as the dialogs, so
 * the error a user sees is the same wherever it is caught.
 */

export const KINDS = ['Subdivision', 'Zone'] as const
export type Kind = (typeof KINDS)[number]

export const CATEGORIES = ['Residential', 'Commercial', 'Industrial', 'Agricultural'] as const
export type Category = (typeof CATEGORIES)[number]

export const FORMS = ['lot', 'house', 'condo'] as const
export type Form = (typeof FORMS)[number]

/** "Priced per sqm of" cell text. */
export const FORM_NAME: Record<Form, string> = { lot: 'Lot area', house: 'Floor area', condo: 'Unit floor area' }

/** Type dialog choice-card copy (§7.5.6 FORM_COPY). `null`: the card is hidden for that category. */
export const FORM_COPY: { base: Record<Form, string> } & Record<Category, Record<Form, [string, string] | null>> = {
  base: {
    lot: 'Priced per sqm of lot area. Asks for frontage, corner, view and terrain.',
    house: 'Priced per sqm of floor area. Also asks for lot area, condition, year built, furnishing and parking.',
    condo: 'Priced per sqm of floor area. Asks for bedrooms, floor level, furnishing and parking.',
  },
  Residential: { lot: ['A lot', 'Residential lot, beach lot'], house: ['A house', 'House and lot, townhouse'], condo: ['A condo unit', 'Condo unit'] },
  Commercial: { lot: ['A lot', 'Commercial lot'], house: ['A building', 'Commercial building, shophouse'], condo: ['A unit', 'Condotel unit, office unit'] },
  Industrial: { lot: ['A lot', 'Industrial lot'], house: ['A building', 'Warehouse, factory'], condo: ['A unit', 'Storage or industrial unit'] },
  Agricultural: { lot: ['A lot', 'Farm lot, agricultural land'], house: ['A building', 'Farmhouse, poultry or piggery building'], condo: null },
}

/** "1 deal" / "2 deals". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Trim and collapse inner spaces (§7.5.5). */
export const cleanName = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim()

/** §8.6.2: the first two numbers separated by a comma or spaces; first latitude, then longitude. */
export function parsePin(s: unknown): { lat: number; lng: number } | null {
  const m = String(s ?? '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/)
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null
}

/** §8.6.2: inside the Cagayan de Oro bounds, inclusive. */
export const pinOk = (p: { lat: number; lng: number } | null): p is { lat: number; lng: number } =>
  !!p && p.lat >= 8.2 && p.lat <= 8.8 && p.lng >= 124.3 && p.lng <= 125.0

/** Coordinates are stored to 6 decimals (§7.5.5). */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** The saved name the new one collides with, ignoring case (R17), or ''. */
export function takenName(name: string, existing: { id: number | string; name: string }[], exceptId?: number | string | null): string {
  const n = name.toLowerCase()
  return existing.find((x) => x.id !== exceptId && x.name.toLowerCase() === n)?.name ?? ''
}

export const SETTINGS_COPY = {
  placeName: 'Enter the name of the subdivision or area.',
  typeName: 'Enter the name of the property type.',
  taken: (name: string) => `${name} is already on the list.`,
  // API only: the dialogs' maxlength stops longer names before they are sent.
  tooLong: (n: number) => `Keep the name to ${n} characters.`,
  center: 'Enter a map center inside Cagayan de Oro, for example 8.47000, 124.65000.',
  lastShownPlace: 'At least one subdivision or area has to stay shown.',
  lastShownType: 'At least one property type has to stay shown.',
  lastPlace: 'At least one subdivision or area has to stay.',
  lastType: 'At least one property type has to stay.',
  noneShownLeft: 'At least one has to stay shown in the add form.',
  usedBy: (n: number) => `Used by ${plural(n, 'closed deal')}. Hide it instead.`,
  formLocked: 'How it is priced is locked while deals use it.',
  saveFailed: 'Settings could not be saved. Try again.',
} as const

export type FieldError = { field: string; message: string }

/** Place dialog checks, in order (§7.5.5). `others` excludes nothing; pass the edited id as `exceptId`. */
export function checkPlace(
  input: { name: string; center: string },
  others: { id: number | string; name: string }[],
  exceptId?: number | string | null,
): FieldError | null {
  const name = cleanName(input.name)
  if (name.length < 2) return { field: 'name', message: SETTINGS_COPY.placeName }
  if (name.length > 60) return { field: 'name', message: SETTINGS_COPY.tooLong(60) }
  const dup = takenName(name, others, exceptId)
  if (dup) return { field: 'name', message: SETTINGS_COPY.taken(dup) }
  if (!pinOk(parsePin(input.center))) return { field: 'center', message: SETTINGS_COPY.center }
  return null
}

/** Type dialog checks, in order (§7.5.6). */
export function checkType(input: { name: string }, others: { id: number | string; name: string }[], exceptId?: number | string | null): FieldError | null {
  const name = cleanName(input.name)
  if (name.length < 2) return { field: 'name', message: SETTINGS_COPY.typeName }
  if (name.length > 40) return { field: 'name', message: SETTINGS_COPY.tooLong(40) }
  const dup = takenName(name, others, exceptId)
  if (dup) return { field: 'name', message: SETTINGS_COPY.taken(dup) }
  return null
}

/** Toast after a successful add or edit (§7.5.5). One toast only: "moved" replaces "renamed". */
export function savedToast(from: string | null, to: string, dealsMoved: number): string {
  if (from === null) return `${to} added`
  if (from === to) return `${to} updated`
  return dealsMoved ? `${plural(dealsMoved, 'deal')} moved to ${to}` : `${from} renamed to ${to}`
}

/** §13.5: the default lists, in this order, inserted in every environment when empty. */
export const DEFAULT_LOCATIONS: { name: string; kind: Kind; lat: number; lng: number }[] = [
  { name: 'Xavier Estates', kind: 'Subdivision', lat: 8.489, lng: 124.662 },
  { name: 'Pueblo de Oro', kind: 'Subdivision', lat: 8.462, lng: 124.629 },
  { name: 'Teakwood Hills', kind: 'Subdivision', lat: 8.477, lng: 124.655 },
  { name: 'Gran Europa', kind: 'Subdivision', lat: 8.471, lng: 124.641 },
  { name: 'Centrio', kind: 'Subdivision', lat: 8.478, lng: 124.647 },
  { name: 'Uptown main road, north stretch', kind: 'Zone', lat: 8.484, lng: 124.65 },
  { name: 'Uptown main road, south stretch', kind: 'Zone', lat: 8.47, lng: 124.635 },
  { name: 'Uptown inner roads', kind: 'Zone', lat: 8.476, lng: 124.659 },
]

export const DEFAULT_TYPES: { name: string; form: Form; category: Category }[] = [
  { name: 'Residential lot', form: 'lot', category: 'Residential' },
  { name: 'House and lot', form: 'house', category: 'Residential' },
  { name: 'Commercial lot', form: 'lot', category: 'Commercial' },
  { name: 'Condo unit', form: 'condo', category: 'Residential' },
  { name: 'Beach lot', form: 'lot', category: 'Residential' },
  { name: 'Townhouse', form: 'house', category: 'Residential' },
  { name: 'Commercial building', form: 'house', category: 'Commercial' },
  { name: 'Condotel unit', form: 'condo', category: 'Commercial' },
  { name: 'Warehouse', form: 'house', category: 'Industrial' },
  { name: 'Industrial lot', form: 'lot', category: 'Industrial' },
  { name: 'Agricultural lot', form: 'lot', category: 'Agricultural' },
]

/** §8.5 size band of the price-basis area. */
export const bandOf = (area: number): 'u' | 'm' | 'o' => (area < 300 ? 'u' : area <= 1000 ? 'm' : 'o')
