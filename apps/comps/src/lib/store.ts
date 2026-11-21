'use client'

import { create } from 'zustand'

import type { BootstrapJSON, DealJSON, LocationJSON, TypeJSON } from './data'
import { DEFAULT_BAR, type BarState, type Fx, type SortDir, type SortKey } from './filters'
import type { TrendBy } from './rates'
import { DEFAULT_CMA_SETTINGS, type CmaSettings } from './cma'

/**
 * The one client store for the browser tab (app PRD §5.1). M2 holds the bootstrap data
 * (§5.3, §14.5), plus (M3) the add-form draft, the last main screen and the leave guard;
 * later milestones add filters and selections here. A full reload
 * starts it again from defaults, as in the reference build.
 */
export type LoadStatus = 'loading' | 'error' | 'ready'

type DataState = {
  status: LoadStatus
  user: BootstrapJSON['user'] | null
  locations: LocationJSON[]
  types: TypeJSON[]
  deals: DealJSON[]
  /** First load, and "Try again": shows skeletons, then the data or the failure banner. */
  load: () => Promise<void>
  /** After a write (§14.5): refetch quietly, keeping what is shown until the answer comes. */
  refresh: () => Promise<void>
  /** After a deal write (§14.5): put the answer in the store, no full reload. Deal counts follow. */
  upsertDeal: (deal: DealJSON) => void
  removeDeal: (id: number) => void

  /** The last main screen visited (§5.1): the "go back" target of Add, Edit and Settings. */
  lastView: MainView
  setLastView: (v: MainView) => void
  /** The open deal on Closed deals (§5.1); set after an edit is saved or a delete is undone. */
  selDeal: number | null
  setSelDeal: (id: number | null) => void
  /** The new-deal draft, kept while the user visits other screens (§5.1, §7.4.8). */
  draft: DealDraft | null
  setDraft: (d: DealDraft | null) => void
  /**
   * Set while a screen has work that needs a question before leaving (an edit with changes,
   * §7.4.8). Navigation in the frame calls it with the move to make; it asks, then moves or stays.
   */
  leaveGuard: LeaveGuard | null
  setLeaveGuard: (g: LeaveGuard | null) => void

  /** One filter bar and Filters sheet for Closed deals and Market rates (§5.1, §6.3). */
  bar: BarState
  /** Location or period: also resets "show all" and the open deal. Type: also clears the sheet. */
  setBarField: (k: 'fLoc' | 'fType' | 'fPeriod', v: string) => void
  setFx: (fx: Fx) => void
  /** The sheet's "Reset": every sheet filter off, a carried Size choice too. */
  resetFx: () => void
  /** Market rates' "See the {n} deals" (§7.2.3): that row's place and type, same period and sheet, no search. */
  seeDeals: (locKey: string, typeKey: string) => void
  /** Market rates (§5.1): the selected row, "show rows with fewer than 5", the trend grouping. */
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  showLow: boolean
  setShowLow: (v: boolean) => void
  trendBy: TrendBy
  setTrendBy: (v: TrendBy) => void
  /** "Clear filters": the three selects to defaults and every sheet filter off; the search stays. */
  clearFilters: () => void
  /** "Show them": Any location, Any type, Any time, no sheet filters; the search stays (§7.1.3). */
  widenFilters: () => void
  /** Closed deals search text as typed (debounced); trimmed when used (§7.1.3). */
  query: string
  setQuery: (q: string) => void
  sort: { key: SortKey; dir: SortDir }
  setSort: (key: SortKey, dir: SortDir) => void
  showAll: boolean
  setShowAll: (v: boolean) => void
  /** The deal hovered on the map or in the list: the other side shows it too (§9.2.1). */
  hovDeal: number | null
  setHovDeal: (id: number | null) => void
  /** The CMA subject as typed and its search settings, kept across screens (§5.1). */
  cma: CmaForm | null
  setCma: (f: CmaForm | null) => void
  cmaSettings: CmaSettings
  setCmaSettings: (s: CmaSettings) => void
}

/** The CMA property card as typed (§7.3.2). Place and type are `id:N`; sizes and numbers as typed. */
export type CmaForm = {
  loc: string
  type: string
  area: string
  lotArea: string
  frontage: string
  corner: boolean
  ridge: boolean
  terrain: '' | 'Flat' | 'Sloped' | 'Irregular'
  beds: string
  baths: string
  parking: string
  parkIncl: '' | 'Included' | 'Separate'
  cond: '' | 'Brand new' | 'Good' | 'Needs repair'
  year: string
  floor: string
  furn: '' | 'Furnished' | 'Semi-furnished' | 'Unfurnished'
  asking: string
  /** The pin field as typed; lat/lng are the subject's applied point. */
  pin: string
  lat: number
  lng: number
  moreOpen: boolean
  searchOpen: boolean
  /** The place / type was shown when last seen: becoming hidden then moves the subject (§7.3.5). */
  locShown: boolean
  typeShown: boolean
}

export type MainView = '/deals' | '/market-rates' | '/cma'
export const MAIN_VIEWS: readonly MainView[] = ['/deals', '/market-rates', '/cma']
export type LeaveGuard = (go: () => void) => void

/** The add form's values as typed (§7.4). Select values: place/type ids as strings, '' or '__legacy'. */
export type DealDraft = {
  pin: string
  loc: string
  /** The user picked the location by hand (or it was set for them): no more suggestions. */
  locManual: boolean
  hint: string
  hintWarn: boolean
  type: string
  details: string
  area: string
  lotArea: string
  frontage: string
  price: string
  date: string
  beds: string
  corner: boolean
  ridge: boolean
  terrain: string
  cond: string
  year: string
  storeys: string
  floor: string
  furn: string
  baths: string
  parking: string
  parkIncl: string
  asking: string
  fin: string
  dom: string
  codeOrLink: string
  note: string
  moreOpen: boolean
}

/** A blank add form. */
export const emptyDraft = (): DealDraft => ({
  pin: '', loc: '', locManual: false, hint: '', hintWarn: false, type: '', details: '', area: '', lotArea: '', frontage: '', price: '', date: '',
  beds: '', corner: false, ridge: false, terrain: '', cond: '', year: '', storeys: '', floor: '', furn: '', baths: '', parking: '', parkIncl: '',
  asking: '', fin: '', dom: '', codeOrLink: '', note: '', moreOpen: false,
})

/** Deal counts per place and type follow the live deals. */
function withCounts(locations: LocationJSON[], types: TypeJSON[], deals: DealJSON[]) {
  const byLoc = new Map<number, number>()
  const byType = new Map<number, number>()
  for (const d of deals) {
    if (d.location.id !== null) byLoc.set(d.location.id, (byLoc.get(d.location.id) ?? 0) + 1)
    if (d.type.id !== null) byType.set(d.type.id, (byType.get(d.type.id) ?? 0) + 1)
  }
  return {
    deals,
    locations: locations.map((l) => ({ ...l, dealCount: byLoc.get(l.id) ?? 0 })),
    types: types.map((t) => ({ ...t, dealCount: byType.get(t.id) ?? 0 })),
  }
}

/** Newest first, as the bootstrap sends them. */
const byDate = (a: DealJSON, b: DealJSON) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)

/** Session ended: go to login and come back here afterwards (AUTH-001). */
export function toLogin() {
  const next = window.location.pathname + window.location.search
  // A full navigation on purpose: logging in again starts a fresh store.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

async function fetchBootstrap(): Promise<BootstrapJSON> {
  const res = await fetch('/api/bootstrap', { cache: 'no-store', credentials: 'same-origin' })
  if (res.status === 401) {
    toLogin()
    throw new Error('unauthenticated')
  }
  if (!res.ok) throw new Error(`bootstrap ${res.status}`)
  return res.json()
}

export const useData = create<DataState>()((set, get) => ({
  status: 'loading',
  user: null,
  locations: [],
  types: [],
  deals: [],
  load: async () => {
    set({ status: 'loading' })
    try {
      set({ ...(await fetchBootstrap()), status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },
  refresh: async () => {
    try {
      set({ ...(await fetchBootstrap()), status: 'ready' })
    } catch {
      if (get().status !== 'ready') set({ status: 'error' })
    }
  },
  upsertDeal: (deal) => {
    const { locations, types, deals } = get()
    set(withCounts(locations, types, [...deals.filter((d) => d.id !== deal.id), deal].sort(byDate)))
  },
  removeDeal: (id) => {
    const { locations, types, deals } = get()
    set(withCounts(locations, types, deals.filter((d) => d.id !== id)))
  },
  lastView: '/deals',
  setLastView: (lastView) => set({ lastView }),
  selDeal: null,
  setSelDeal: (selDeal) => set({ selDeal }),
  draft: null,
  setDraft: (draft) => set({ draft }),
  leaveGuard: null,
  setLeaveGuard: (leaveGuard) => set({ leaveGuard }),
  bar: DEFAULT_BAR,
  setBarField: (k, v) => set((st) => ({ bar: { ...st.bar, [k]: v, ...(k === 'fType' ? { fx: {}, band: undefined } : {}) }, showAll: false, selDeal: null })),
  setFx: (fx) => set((st) => ({ bar: { ...st.bar, fx }, showAll: false, selDeal: null })),
  clearFilters: () => set({ bar: DEFAULT_BAR, showAll: false, selDeal: null }),
  widenFilters: () => set({ bar: { fLoc: '', fType: '', fPeriod: '9999', fx: {} }, showAll: false, selDeal: null }),
  resetFx: () => set((st) => ({ bar: { ...st.bar, fx: {}, band: undefined }, showAll: false, selDeal: null })),
  seeDeals: (locKey, typeKey) =>
    set((st) => {
      // A Size choice only shows with no type set; it keeps applying, hidden, once the type is set.
      const { band, ...rest } = st.bar.fx
      const carried = typeof band === 'string' && !st.bar.fType ? band : st.bar.band
      return { bar: { ...st.bar, fLoc: locKey, fType: typeKey, fx: st.bar.fType ? st.bar.fx : rest, band: carried }, query: '', showAll: false, selDeal: null }
    }),
  selectedKey: null,
  setSelectedKey: (selectedKey) => set({ selectedKey }),
  showLow: false,
  setShowLow: (showLow) => set({ showLow }),
  trendBy: 'q',
  setTrendBy: (trendBy) => set({ trendBy }),
  query: '',
  setQuery: (query) => set({ query, showAll: false, selDeal: null }),
  sort: { key: 'date', dir: 'desc' },
  setSort: (key, dir) => set({ sort: { key, dir } }),
  showAll: false,
  setShowAll: (showAll) => set({ showAll }),
  hovDeal: null,
  setHovDeal: (hovDeal) => set({ hovDeal }),
  cma: null,
  setCma: (cma) => set({ cma }),
  cmaSettings: DEFAULT_CMA_SETTINGS,
  setCmaSettings: (cmaSettings) => set({ cmaSettings }),
}))

/** Only text fields count as unsaved work in a new draft (§7.4.8): the type select always has a value. */
export const DRAFT_TEXT_KEYS = ['pin', 'details', 'area', 'lotArea', 'frontage', 'price', 'date', 'asking', 'dom', 'codeOrLink', 'note', 'year', 'floor'] as const
export const draftHasText = (d: DealDraft | null) => !!d && DRAFT_TEXT_KEYS.some((k) => d[k].trim() !== '')

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message?: string; field?: string }

/** JSON call to the Comps API. 401 sends the user to login; network errors come back as status 0. */
export async function api<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, code: 'network' }
  }
  if (res.status === 401) toLogin()
  const json = res.status === 204 ? null : await res.json().catch(() => null)
  if (res.ok) return { ok: true, status: res.status, data: json as T }
  const err = (json as { error?: { code?: string; message?: string; field?: string } } | null)?.error
  return { ok: false, status: res.status, code: err?.code ?? 'server', message: err?.message, field: err?.field }
}
