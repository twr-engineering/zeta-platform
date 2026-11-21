/**
 * Comps data access on the Payload Local API (Tier 1, client-apps/comps.md C2): bootstrap,
 * the deal and Settings JSON shapes (app PRD §14.3–14.4) and every Settings write with its
 * rules. Not `server-only`, so the seed scripts and the database tests can call it directly;
 * route handlers stay thin wrappers. Every call runs as the signed-in user with
 * `overrideAccess: false`, so collection access still applies.
 */
import type { Payload, PayloadRequest, Where } from 'payload'
import type { CompsDeal, CompsLocation, CompsPropertyType, User } from '@zeta/cms-config/types'

import type { ApiErrorCode } from './api-codes'
import { LEGACY_TYPE, buildRecord, checkDeal, inputShapeOk, refKey, type DealInput, type DupCandidate, type TypeInfo } from './deals'
import { manilaISO } from './format'
import {
  CATEGORIES,
  DEFAULT_LOCATIONS,
  DEFAULT_TYPES,
  FORMS,
  KINDS,
  SETTINGS_COPY,
  bandOf,
  checkPlace,
  checkType,
  cleanName,
  parsePin,
  round6,
  type Category,
  type Form,
  type Kind,
} from './settings'

export type Ctx = { payload: Payload; user: User }

export type LocationJSON = { id: number; name: string; kind: Kind; lat: number; lng: number; hidden: boolean; sortOrder: number; dealCount: number }
export type TypeJSON = { id: number; name: string; form: Form; category: Category; hidden: boolean; sortOrder: number; dealCount: number }
export type DealJSON = ReturnType<typeof serializeDeal>
export type BootstrapJSON = { user: { id: number; name: string; email: string }; locations: LocationJSON[]; types: TypeJSON[]; deals: DealJSON[] }

/** A failed rule: the API answers with this code, exact UI copy and (for 422) the field. */
export type Fail = { error: ApiErrorCode; message?: string; field?: string }
export const isFail = (x: unknown): x is Fail => !!x && typeof x === 'object' && 'error' in x

type Req = Partial<PayloadRequest>
const as = (ctx: Ctx, req?: Req) => ({ user: ctx.user, overrideAccess: false as const, ...(req ? { req } : {}) })

const relId = (v: unknown): number | null => (v && typeof v === 'object' ? ((v as { id: number }).id ?? null) : typeof v === 'number' ? v : null)

const locJSON = (l: CompsLocation, dealCount: number): LocationJSON => ({
  id: l.id,
  name: l.name,
  kind: l.kind,
  lat: Number(l.lat),
  lng: Number(l.lng),
  hidden: !!l.hidden,
  sortOrder: l.sortOrder,
  dealCount,
})
const typeJSON = (t: CompsPropertyType, dealCount: number): TypeJSON => ({
  id: t.id,
  name: t.name,
  form: t.form,
  category: t.category,
  hidden: !!t.hidden,
  sortOrder: t.sortOrder,
  dealCount,
})

/** The deal object of §14.3. Legacy names have no id and no kind; a legacy type prices as a Residential house. */
export function serializeDeal(d: CompsDeal, locs: Map<number, LocationJSON>, types: Map<number, TypeJSON>) {
  const loc = locs.get(relId(d.location) ?? -1)
  const type = types.get(relId(d.propertyType) ?? -1)
  const area = Number(d.area)
  const price = Number(d.price)
  const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v))
  return {
    id: d.id,
    location: loc ? { id: loc.id, name: loc.name, kind: loc.kind as Kind | '' } : { id: null, name: d.legacyLocationName ?? '', kind: '' as const },
    type: type
      ? { id: type.id, name: type.name, form: type.form, category: type.category }
      : { id: null, name: d.legacyTypeName ?? '', form: 'house' as Form, category: 'Residential' as Category },
    area,
    lotArea: num(d.lotArea),
    price,
    // Exact: rounding here and again in peso() would show ₱36,504 for 36,503.497 (D.5 L12).
    pp: price / area,
    band: bandOf(area),
    date: d.dateSold,
    lat: Number(d.lat),
    lng: Number(d.lng),
    details: d.details ?? null,
    code: d.code ?? null,
    link: d.link ?? null,
    note: d.note ?? null,
    frontage: num(d.frontage),
    corner: !!d.corner,
    view: d.view ?? null,
    terrain: d.terrain ?? null,
    cond: d.cond ?? null,
    year: num(d.yearBuilt),
    floor: num(d.floor),
    furn: d.furn ?? null,
    beds: num(d.beds),
    baths: num(d.baths),
    parking: num(d.parking),
    parkIncl: d.parkIncl ?? null,
    storeys: num(d.storeys),
    fin: d.fin ?? null,
    asking: num(d.asking),
    dom: num(d.dom),
    createdAt: d.createdAt,
    createdBy: relId(d.createdBy),
    updatedAt: d.editedAt ?? d.updatedAt,
    updatedBy: relId(d.editedBy),
  }
}

async function allDeals(ctx: Ctx, req?: Req): Promise<CompsDeal[]> {
  const res = await ctx.payload.find({ collection: 'comps-deals', depth: 0, pagination: false, sort: ['-dateSold', '-createdAt'], ...as(ctx, req) })
  return res.docs
}

/** Locations and types in Settings order, each with its non-deleted deal count. */
export async function loadSettings(ctx: Ctx, deals?: CompsDeal[], req?: Req) {
  const [locs, types, ds] = await Promise.all([
    ctx.payload.find({ collection: 'comps-locations', depth: 0, pagination: false, sort: 'sortOrder', ...as(ctx, req) }),
    ctx.payload.find({ collection: 'comps-property-types', depth: 0, pagination: false, sort: 'sortOrder', ...as(ctx, req) }),
    deals ? Promise.resolve(deals) : allDeals(ctx, req),
  ])
  const byLoc = new Map<number, number>()
  const byType = new Map<number, number>()
  for (const d of ds) {
    const l = relId(d.location)
    const t = relId(d.propertyType)
    if (l !== null) byLoc.set(l, (byLoc.get(l) ?? 0) + 1)
    if (t !== null) byType.set(t, (byType.get(t) ?? 0) + 1)
  }
  return {
    locations: locs.docs.map((l) => locJSON(l, byLoc.get(l.id) ?? 0)),
    types: types.docs.map((t) => typeJSON(t, byType.get(t.id) ?? 0)),
  }
}

/** GET /api/bootstrap (§14.3): everything the app needs at start. */
export async function loadBootstrap(ctx: Ctx): Promise<BootstrapJSON> {
  const deals = await allDeals(ctx)
  const { locations, types } = await loadSettings(ctx, deals)
  const L = new Map(locations.map((l) => [l.id, l]))
  const T = new Map(types.map((t) => [t.id, t]))
  return {
    user: { id: ctx.user.id, name: ctx.user.name || 'Jong', email: ctx.user.email },
    locations,
    types,
    deals: deals.map((d) => serializeDeal(d, L, T)),
  }
}

// ---------- transactions ----------

/** One transaction per Settings write (§14.4). Rolls back on a thrown error or a returned Fail. */
async function inTx<T>(payload: Payload, fn: (req: Req) => Promise<T | Fail>): Promise<T | Fail> {
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) return fn({})
  const req: Req = { transactionID }
  try {
    const out = await fn(req)
    if (isFail(out)) await payload.db.rollbackTransaction(transactionID)
    else await payload.db.commitTransaction(transactionID)
    return out
  } catch (e) {
    await payload.db.rollbackTransaction(transactionID)
    throw e
  }
}

/**
 * The case-insensitive unique index (comps migration) caught a race the pre-check missed.
 * Payload's Postgres adapter turns error 23505 into a ValidationError "Value must be unique".
 */
const isUniqueViolation = (e: unknown): boolean => {
  const o = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})
  const err = o(e)
  const errors = o(err.data).errors
  return (
    err.code === '23505' ||
    o(err.cause).code === '23505' ||
    (Array.isArray(errors) && errors.some((x) => /unique/i.test(String(o(x).message ?? ''))))
  )
}

const dealCount = async (ctx: Ctx, req: Req, field: 'location' | 'propertyType', id: number) =>
  (await ctx.payload.count({ collection: 'comps-deals', where: { [field]: { equals: id } }, ...as(ctx, req) })).totalDocs

const nextSort = (rows: { sortOrder: number }[]) => rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1

// ---------- body parsing (shape only; rules come after) ----------

type Body = Partial<Record<string, unknown>>
const bad: Fail = { error: 'bad_request' }
const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined ? undefined : null)

// ---------- locations ----------

export async function createLocation(ctx: Ctx, body: Body): Promise<{ location: LocationJSON } | Fail> {
  const name = str(body.name)
  const center = str(body.center)
  const kind = body.kind ?? 'Subdivision'
  if (name === null || center === null) return bad
  return inTx(ctx.payload, async (req) => {
    const { locations } = await loadSettings(ctx, [], req)
    const fail = checkPlace({ name: name ?? '', center: center ?? '' }, locations)
    if (fail) return { error: 'validation', ...fail }
    if (!KINDS.includes(kind as Kind)) return { error: 'validation', field: 'kind', message: 'Choose the kind of place.' }
    const p = parsePin(center)!
    const clean = cleanName(name)
    try {
      const doc = await ctx.payload.create({
        collection: 'comps-locations',
        data: { name: clean, kind: kind as Kind, lat: round6(p.lat), lng: round6(p.lng), hidden: false, sortOrder: nextSort(locations) },
        ...as(ctx, req),
      })
      return { location: locJSON(doc, 0) }
    } catch (e) {
      if (isUniqueViolation(e)) return { error: 'validation', field: 'name', message: SETTINGS_COPY.taken(clean) }
      throw e
    }
  })
}

export async function updateLocation(ctx: Ctx, id: number, body: Body): Promise<{ location: LocationJSON; dealsMoved: number } | Fail> {
  if (body.hidden !== undefined && typeof body.hidden !== 'boolean') return bad
  if (str(body.name) === null || str(body.center) === null) return bad
  return inTx(ctx.payload, async (req) => {
    const { locations } = await loadSettings(ctx, [], req)
    const cur = locations.find((l) => l.id === id)
    if (!cur) return { error: 'not_found' }
    const name = body.name === undefined ? cur.name : cleanName(body.name)
    const center = body.center === undefined ? `${cur.lat}, ${cur.lng}` : String(body.center)
    const fail = checkPlace({ name, center }, locations, id)
    if (fail) return { error: 'validation', ...fail }
    if (body.kind !== undefined && !KINDS.includes(body.kind as Kind)) return { error: 'validation', field: 'kind', message: 'Choose the kind of place.' }
    if (body.hidden === true && !cur.hidden && locations.filter((l) => !l.hidden).length <= 1)
      return { error: 'conflict', message: SETTINGS_COPY.lastShownPlace }
    const p = parsePin(center)!
    const count = await dealCount(ctx, req, 'location', id)
    try {
      const doc = await ctx.payload.update({
        collection: 'comps-locations',
        id,
        data: {
          name,
          lat: round6(p.lat),
          lng: round6(p.lng),
          ...(body.kind !== undefined ? { kind: body.kind as Kind } : {}),
          ...(body.hidden !== undefined ? { hidden: body.hidden as boolean } : {}),
        },
        ...as(ctx, req),
      })
      return { location: locJSON(doc, count), dealsMoved: name !== cur.name ? count : 0 }
    } catch (e) {
      if (isUniqueViolation(e)) return { error: 'validation', field: 'name', message: SETTINGS_COPY.taken(name) }
      throw e
    }
  })
}

export async function deleteLocation(ctx: Ctx, id: number): Promise<{ ok: true } | Fail> {
  return inTx(ctx.payload, async (req) => {
    const { locations } = await loadSettings(ctx, [], req)
    const cur = locations.find((l) => l.id === id)
    if (!cur) return { error: 'not_found' }
    const n = await dealCount(ctx, req, 'location', id)
    if (n) return { error: 'conflict', message: SETTINGS_COPY.usedBy(n) }
    if (locations.length <= 1) return { error: 'conflict', message: SETTINGS_COPY.lastPlace }
    if (!locations.some((l) => l.id !== id && !l.hidden)) return { error: 'conflict', message: SETTINGS_COPY.noneShownLeft }
    // Deleted (trashed) deals do not count as "used" (§13.2), but still point here: they keep
    // the name as a legacy name, so Undo within the purge window still brings them back.
    await ctx.payload.update({
      collection: 'comps-deals',
      where: { and: [{ location: { equals: id } }, { deletedAt: { exists: true } }] },
      data: { location: null, legacyLocationName: cur.name },
      trash: true,
      context: { keepStamps: true },
      ...as(ctx, req),
    })
    await ctx.payload.delete({ collection: 'comps-locations', id, ...as(ctx, req) })
    return { ok: true as const }
  })
}

// ---------- property types ----------

export async function createType(ctx: Ctx, body: Body): Promise<{ type: TypeJSON } | Fail> {
  const name = str(body.name)
  if (name === null) return bad
  const category = body.category ?? 'Residential'
  const form = body.form ?? 'lot'
  return inTx(ctx.payload, async (req) => {
    const { types } = await loadSettings(ctx, [], req)
    const fail = checkType({ name: name ?? '' }, types)
    if (fail) return { error: 'validation', ...fail }
    if (!CATEGORIES.includes(category as Category)) return { error: 'validation', field: 'category', message: 'Choose one of the four categories.' }
    if (!FORMS.includes(form as Form)) return { error: 'validation', field: 'form', message: 'Choose how it is priced.' }
    const clean = cleanName(name)
    try {
      const doc = await ctx.payload.create({
        collection: 'comps-property-types',
        data: { name: clean, category: category as Category, form: form as Form, hidden: false, sortOrder: nextSort(types) },
        ...as(ctx, req),
      })
      return { type: typeJSON(doc, 0) }
    } catch (e) {
      if (isUniqueViolation(e)) return { error: 'validation', field: 'name', message: SETTINGS_COPY.taken(clean) }
      throw e
    }
  })
}

export async function updateType(ctx: Ctx, id: number, body: Body): Promise<{ type: TypeJSON; dealsMoved: number } | Fail> {
  if (body.hidden !== undefined && typeof body.hidden !== 'boolean') return bad
  if (str(body.name) === null) return bad
  return inTx(ctx.payload, async (req) => {
    const { types } = await loadSettings(ctx, [], req)
    const cur = types.find((t) => t.id === id)
    if (!cur) return { error: 'not_found' }
    const name = body.name === undefined ? cur.name : cleanName(body.name)
    const fail = checkType({ name }, types, id)
    if (fail) return { error: 'validation', ...fail }
    if (body.category !== undefined && !CATEGORIES.includes(body.category as Category))
      return { error: 'validation', field: 'category', message: 'Choose one of the four categories.' }
    if (body.form !== undefined && !FORMS.includes(body.form as Form)) return { error: 'validation', field: 'form', message: 'Choose how it is priced.' }
    const count = await dealCount(ctx, req, 'propertyType', id)
    if (body.form !== undefined && body.form !== cur.form && count) return { error: 'conflict', message: SETTINGS_COPY.formLocked }
    if (body.hidden === true && !cur.hidden && types.filter((t) => !t.hidden).length <= 1) return { error: 'conflict', message: SETTINGS_COPY.lastShownType }
    try {
      const doc = await ctx.payload.update({
        collection: 'comps-property-types',
        id,
        data: {
          name,
          ...(body.category !== undefined ? { category: body.category as Category } : {}),
          ...(body.form !== undefined ? { form: body.form as Form } : {}),
          ...(body.hidden !== undefined ? { hidden: body.hidden as boolean } : {}),
        },
        ...as(ctx, req),
      })
      return { type: typeJSON(doc, count), dealsMoved: name !== cur.name ? count : 0 }
    } catch (e) {
      if (isUniqueViolation(e)) return { error: 'validation', field: 'name', message: SETTINGS_COPY.taken(name) }
      throw e
    }
  })
}

export async function deleteType(ctx: Ctx, id: number): Promise<{ ok: true } | Fail> {
  return inTx(ctx.payload, async (req) => {
    const { types } = await loadSettings(ctx, [], req)
    const cur = types.find((t) => t.id === id)
    if (!cur) return { error: 'not_found' }
    const n = await dealCount(ctx, req, 'propertyType', id)
    if (n) return { error: 'conflict', message: SETTINGS_COPY.usedBy(n) }
    if (types.length <= 1) return { error: 'conflict', message: SETTINGS_COPY.lastType }
    if (!types.some((t) => t.id !== id && !t.hidden)) return { error: 'conflict', message: SETTINGS_COPY.noneShownLeft }
    await ctx.payload.update({
      collection: 'comps-deals',
      where: { and: [{ propertyType: { equals: id } }, { deletedAt: { exists: true } }] },
      data: { propertyType: null, legacyTypeName: cur.name },
      trash: true,
      context: { keepStamps: true },
      ...as(ctx, req),
    })
    await ctx.payload.delete({ collection: 'comps-property-types', id, ...as(ctx, req) })
    return { ok: true as const }
  })
}

// ---------- default lists (§13.5) ----------

/**
 * Inserts the default Settings lists when a table is empty, stamped as the admin. Runs from
 * seed:admin (every environment, production included) and seed:sample. Safe to repeat: a list
 * that already has rows is left alone, so edits made in the app are never overwritten.
 */
export async function ensureDefaultSettings(payload: Payload, admin: User): Promise<{ locations: number; types: number }> {
  const opts = { user: admin, overrideAccess: true as const }
  const added = { locations: 0, types: 0 }
  if ((await payload.count({ collection: 'comps-locations', ...opts })).totalDocs === 0) {
    for (const [i, l] of DEFAULT_LOCATIONS.entries()) {
      await payload.create({ collection: 'comps-locations', data: { ...l, hidden: false, sortOrder: i + 1 }, ...opts })
      added.locations++
    }
  }
  if ((await payload.count({ collection: 'comps-property-types', ...opts })).totalDocs === 0) {
    for (const [i, t] of DEFAULT_TYPES.entries()) {
      await payload.create({ collection: 'comps-property-types', data: { ...t, hidden: false, sortOrder: i + 1 }, ...opts })
      added.types++
    }
  }
  return added
}

// ---------- deals (§14.3) ----------

type DealOut = { deal: DealJSON }

const blankish = (v: unknown) => v === undefined || v === null || String(v).trim() === ''

/**
 * Resolves the place and type a deal input names. An id must exist (hidden ones are accepted,
 * §14.3); a legacy name is only accepted when editing a deal that already has that name.
 */
async function resolveRefs(ctx: Ctx, req: Req, body: DealInput, current: CompsDeal | null) {
  const { locations, types } = await loadSettings(ctx, [], req)
  const locId = blankish(body.locationId) ? null : Number(body.locationId)
  const typeId = blankish(body.typeId) ? null : Number(body.typeId)
  const loc = locId === null ? null : (locations.find((l) => l.id === locId) ?? null)
  const type = typeId === null ? null : (types.find((t) => t.id === typeId) ?? null)
  const legacyLoc =
    !loc && !blankish(body.legacyLocationName) && current?.legacyLocationName && body.legacyLocationName === current.legacyLocationName
      ? current.legacyLocationName
      : null
  const legacyType =
    !type && !blankish(body.legacyTypeName) && current?.legacyTypeName && body.legacyTypeName === current.legacyTypeName ? current.legacyTypeName : null
  return { locations, types, loc, type, legacyLoc, legacyType }
}

/** Runs §8.6.3 and builds §8.6.4 for a create (current = null) or a replace. */
async function prepareDeal(ctx: Ctx, req: Req, body: DealInput, current: CompsDeal | null) {
  const r = await resolveRefs(ctx, req, body, current)
  if (!r.type && !r.legacyType) return { fail: bad }
  const typeInfo: TypeInfo = r.type ? { form: r.type.form, category: r.type.category } : LEGACY_TYPE
  const locName = r.loc?.name ?? r.legacyLoc
  const locKey = r.loc ? refKey({ id: r.loc.id, name: r.loc.name }) : r.legacyLoc ? refKey({ id: null, name: r.legacyLoc }) : ''
  let others: DupCandidate[] = []
  if (locName && !blankish(body.details)) {
    const where: Where = r.loc ? { location: { equals: r.loc.id } } : { legacyLocationName: { equals: r.legacyLoc } }
    const found = await ctx.payload.find({ collection: 'comps-deals', where, depth: 0, pagination: false, ...as(ctx, req) })
    others = found.docs.map((d) => ({ id: d.id, locKey, details: d.details ?? null, price: Number(d.price) }))
  }
  const err = checkDeal(body, {
    kind: r.loc ? r.loc.kind : r.legacyLoc ? '' : null,
    type: typeInfo,
    locKey,
    others,
    editId: current?.id ?? null,
    today: manilaISO(),
  })
  if (err) return { fail: { error: 'validation', ...err } as Fail }
  const data = {
    ...buildRecord(body, typeInfo),
    location: r.loc?.id ?? null,
    legacyLocationName: r.loc ? null : r.legacyLoc,
    propertyType: r.type?.id ?? null,
    legacyTypeName: r.type ? null : r.legacyType,
  }
  const L = new Map(r.locations.map((l) => [l.id, l]))
  const T = new Map(r.types.map((t) => [t.id, t]))
  return { data, L, T }
}

/** GET /api/deals: live deals, newest first. */
export async function listDeals(ctx: Ctx): Promise<{ deals: DealJSON[] }> {
  return { deals: (await loadBootstrap(ctx)).deals }
}

/** POST /api/deals. */
export async function createDeal(ctx: Ctx, body: DealInput): Promise<DealOut | Fail> {
  if (!inputShapeOk(body)) return bad
  return inTx(ctx.payload, async (req) => {
    const p = await prepareDeal(ctx, req, body, null)
    if ('fail' in p) return p.fail!
    const doc = await ctx.payload.create({ collection: 'comps-deals', data: p.data, depth: 0, ...as(ctx, req) })
    return { deal: serializeDeal(doc, p.L, p.T) }
  })
}

/** PUT /api/deals/{id}: replaces every value; keeps createdAt/createdBy (ADD-012). */
export async function updateDeal(ctx: Ctx, id: number, body: DealInput): Promise<DealOut | Fail> {
  if (!inputShapeOk(body)) return bad
  return inTx(ctx.payload, async (req) => {
    const current = await findLive(ctx, req, id)
    if (!current) return { error: 'not_found' }
    const p = await prepareDeal(ctx, req, body, current)
    if ('fail' in p) return p.fail!
    const doc = await ctx.payload.update({ collection: 'comps-deals', id, data: p.data, depth: 0, ...as(ctx, req) })
    return { deal: serializeDeal(doc, p.L, p.T) }
  })
}

async function findLive(ctx: Ctx, req: Req, id: number): Promise<CompsDeal | null> {
  const res = await ctx.payload.find({ collection: 'comps-deals', where: { id: { equals: id } }, depth: 0, limit: 1, ...as(ctx, req) })
  return res.docs[0] ?? null
}

/** DELETE /api/deals/{id}: soft delete (Payload trash; the hook stamps deletedBy). */
export async function trashDeal(ctx: Ctx, id: number): Promise<{ id: number } | Fail> {
  return inTx(ctx.payload, async (req) => {
    if (!(await findLive(ctx, req, id))) return { error: 'not_found' }
    await ctx.payload.update({ collection: 'comps-deals', id, data: { deletedAt: new Date().toISOString() }, depth: 0, ...as(ctx, req) })
    return { id }
  })
}

/** POST /api/deals/{id}/restore: Undo. Clears deletedAt/deletedBy; the edit stamps stay as they were (DATA-003). */
export async function restoreDeal(ctx: Ctx, id: number): Promise<DealOut | Fail> {
  return inTx(ctx.payload, async (req) => {
    const res = await ctx.payload.find({ collection: 'comps-deals', where: { id: { equals: id } }, trash: true, depth: 0, limit: 1, ...as(ctx, req) })
    const cur = res.docs[0]
    if (!cur) return { error: 'not_found' }
    const doc = cur.deletedAt
      ? await ctx.payload.update({ collection: 'comps-deals', id, data: { deletedAt: null }, trash: true, depth: 0, ...as(ctx, req) })
      : cur
    const { locations, types } = await loadSettings(ctx, [], req)
    return { deal: serializeDeal(doc, new Map(locations.map((l) => [l.id, l])), new Map(types.map((t) => [t.id, t]))) }
  })
}
