'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useConfirm } from '@/components/Confirm'
import { Icon } from '@/components/Icon'
import { LoadError } from '@/components/LoadState'
import { PinMap, type LatLng } from '@/components/map/PinMap'
import { PlaceDialog, type PlaceDraft } from '@/components/settings/PlaceDialog'
import { InfoButton } from '@/components/Tips'
import { useToast } from '@/components/Toast'
import { PAGE_HEADS } from '@/lib/copy'
import type { DealJSON, LocationJSON, TypeJSON } from '@/lib/data'
import {
  BATH_OPTS,
  COND_OPTS,
  DEAL_COPY,
  FIN_OPTS,
  FURN_OPTS,
  LEGACY_TYPE,
  PARKING_OPTS,
  PARK_INCL_OPTS,
  STOREY_OPTS,
  TERRAINS,
  bedOpts,
  checkDeal,
  commas,
  digits,
  hasFurnish,
  hasParking,
  hasRooms,
  nearestPlace,
  preview,
  previewWarning,
  refKey,
  suggestionHint,
  type DealInput,
  type Opt,
  type TypeInfo,
} from '@/lib/deals'
import { manilaISO, peso, pinText } from '@/lib/format'
import { CATEGORIES, SETTINGS_COPY, parsePin, pinOk } from '@/lib/settings'
import { metres } from '@/lib/stats'
import { api, useData, type DealDraft } from '@/lib/store'

import { useDeleteDeal } from './useDeleteDeal'

/**
 * Add and edit a deal (app PRD §7.4). One screen for both routes: `/deals/new` keeps its
 * draft in the store across tabs (§5.1); `/deals/{id}/edit` works on a local copy and guards
 * every way out while it has changes (§7.4.8). The rules and the saved record come from
 * lib/deals, the same module the API runs.
 */

const LEGACY = '__legacy'
const NEW_PLACE = '__new'

/** Request key → input id, for showing a field's message under it (§7.4.5). */
const FIELD_ID: Record<string, string> = {
  pin: 'aPin',
  locationId: 'aLoc',
  details: 'aBL',
  area: 'aArea',
  lotArea: 'aLotA',
  frontage: 'aFront',
  price: 'aPrice',
  date: 'aDate',
  dom: 'aDom',
  asking: 'aAsking',
  year: 'aYear',
  floor: 'aFloor',
  codeOrLink: 'aCode',
}
/** Inputs inside "More details": an error there opens it. */
const IN_MORE = new Set(['dom', 'asking', 'year', 'floor', 'codeOrLink'])
/** Only text fields count as unsaved work in a new draft (§7.4.8). */
const TEXT_KEYS = ['pin', 'details', 'area', 'lotArea', 'frontage', 'price', 'date', 'asking', 'dom', 'codeOrLink', 'note', 'year', 'floor'] as const

export const emptyDraft = (): DealDraft => ({
  pin: '', loc: '', locManual: false, hint: '', hintWarn: false, type: '', details: '', area: '', lotArea: '', frontage: '', price: '', date: '',
  beds: '', corner: false, ridge: false, terrain: '', cond: '', year: '', storeys: '', floor: '', furn: '', baths: '', parking: '', parkIncl: '',
  asking: '', fin: '', dom: '', codeOrLink: '', note: '', moreOpen: false,
})

const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v))

function draftFromDeal(d: DealJSON): DealDraft {
  const more = !!(d.corner || d.view || d.terrain || d.cond || d.year || d.floor || d.furn || d.storeys || d.baths !== null || d.parking !== null || d.parkIncl || d.asking || d.fin || d.dom !== null || d.code || d.link || d.note)
  return {
    ...emptyDraft(),
    pin: pinText(d.lat, d.lng),
    loc: d.location.id !== null ? String(d.location.id) : LEGACY,
    locManual: true,
    type: d.type.id !== null ? String(d.type.id) : LEGACY,
    details: d.details ?? '',
    area: s(d.area),
    lotArea: s(d.lotArea),
    frontage: s(d.frontage),
    price: Math.round(d.price).toLocaleString('en-US'),
    date: d.date,
    beds: s(d.beds),
    corner: d.corner,
    ridge: d.view === 'Ridge view',
    terrain: d.terrain ?? '',
    cond: d.cond ?? '',
    year: s(d.year),
    storeys: s(d.storeys),
    floor: s(d.floor),
    furn: d.furn ?? '',
    baths: s(d.baths),
    parking: s(d.parking),
    parkIncl: d.parkIncl ?? '',
    asking: d.asking ? Math.round(d.asking).toLocaleString('en-US') : '',
    fin: d.fin ?? '',
    dom: s(d.dom),
    codeOrLink: d.code || d.link || '',
    note: d.note ?? '',
    moreOpen: more,
  }
}

/** Types in the select's order: category groups, Settings order inside each. */
const typeOrder = (types: TypeJSON[]) => CATEGORIES.flatMap((c) => types.filter((t) => t.category === c))
const firstShownType = (types: TypeJSON[]) => typeOrder(types).find((t) => !t.hidden) ?? typeOrder(types)[0]

type Err = { field?: string; message: string } | null

export function DealScreen({ editId }: { editId?: number }) {
  const router = useRouter()
  const toast = useToast()
  const ask = useConfirm()
  const deleteDeal = useDeleteDeal()
  const status = useData((x) => x.status)
  const locations = useData((x) => x.locations)
  const types = useData((x) => x.types)
  const deals = useData((x) => x.deals)
  const lastView = useData((x) => x.lastView)
  const ready = status === 'ready'
  const isEdit = editId !== undefined
  const editDeal = useMemo(() => (isEdit ? (deals.find((x) => x.id === editId) ?? null) : null), [deals, editId, isEdit])

  const [d, setD] = useState<DealDraft>(() => (isEdit ? emptyDraft() : (useData.getState().draft ?? emptyDraft())))
  const [err, setErr] = useState<Err>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(!isEdit)
  const dirty = useRef(false)
  const leaving = useRef(false)
  const pinRef = useRef<HTMLInputElement>(null)
  const locRef = useRef<HTMLSelectElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)

  // ----- edit: wait for the bootstrap, then fill from the deal (adjusted while rendering) or leave (§5 routes) -----
  if (isEdit && ready && !loaded && editDeal) {
    setLoaded(true)
    setD(draftFromDeal(editDeal))
  }
  useEffect(() => {
    if (isEdit && ready && !loaded && !editDeal) {
      toast(DEAL_COPY.missing)
      router.replace('/deals')
    }
  }, [isEdit, ready, loaded, editDeal, router, toast])

  // ----- new: keep the draft in the store (§5.1) -----
  useEffect(() => {
    if (!isEdit && !leaving.current) useData.getState().setDraft(d)
  }, [d, isEdit])

  // ----- Settings changes under an open draft (§7.5.4): deleted place cleared, deleted type → first shown -----
  if (ready && loaded) {
    let n = d
    if (/^\d+$/.test(d.loc) && !locations.some((l) => String(l.id) === d.loc)) n = { ...n, loc: '' }
    if (!(d.type === LEGACY && isEdit) && !types.some((t) => String(t.id) === d.type)) {
      const t = firstShownType(types)
      if (t) n = { ...n, type: String(t.id), beds: t.form !== 'condo' && n.beds === '0' ? '' : n.beds }
    }
    if (n !== d) setD(n)
  }

  // ----- derived -----
  const place: LocationJSON | null = /^\d+$/.test(d.loc) ? (locations.find((l) => String(l.id) === d.loc) ?? null) : null
  const legacyLoc = d.loc === LEGACY && editDeal ? editDeal.location.name : null
  const kind = place ? place.kind : legacyLoc ? '' : null
  const typeRow = types.find((t) => String(t.id) === d.type) ?? null
  const legacyType = d.type === LEGACY && editDeal ? editDeal.type.name : null
  const type: TypeInfo = typeRow ? { form: typeRow.form, category: typeRow.category } : LEGACY_TYPE
  const lot = type.form === 'lot'
  const house = type.form === 'house'
  const condo = type.form === 'condo'
  const zone = kind === 'Zone'
  const locKey = place ? refKey({ id: place.id, name: place.name }) : legacyLoc ? refKey({ id: null, name: legacyLoc }) : ''
  const typeKey = typeRow ? refKey({ id: typeRow.id, name: typeRow.name }) : legacyType ? refKey({ id: null, name: legacyType }) : ''

  const mapPin = useMemo(() => {
    const p = parsePin(d.pin)
    return pinOk(p) ? { lat: p.lat, lng: p.lng } : null
  }, [d.pin])
  const mapPlaces = useMemo(() => locations.map((l) => ({ id: l.id, name: l.name, lat: l.lat, lng: l.lng })), [locations])
  const mapDots = useMemo(() => deals.map((x) => ({ lat: x.lat, lng: x.lng })), [deals])

  const peers = deals.filter((x) => x.id !== editId && refKey(x.location) === locKey && refKey(x.type) === typeKey).map((x) => x.pp)
  const pv = preview(parseFloat(d.area), digits(d.price), !!locKey, peers)

  // ----- edits and the leave guard (§7.4.8) -----
  const markDirty = useCallback(() => {
    if (isEdit) dirty.current = true
  }, [isEdit])
  const sentinel = useRef(false)
  const pendingGo = useRef<(() => void) | null>(null)

  /** Leave edit mode: drop the guard and any Back sentinel, then run the move. */
  const leave = useCallback((go: () => void) => {
    dirty.current = false
    useData.getState().setLeaveGuard(null)
    if (sentinel.current) {
      sentinel.current = false
      pendingGo.current = go
      window.history.back()
    } else go()
  }, [])

  const askDiscard = useCallback(
    (go: () => void, onCancel?: () => void) => ask('Discard your changes?', 'Your edits to this deal will be lost.', 'Discard', () => leave(go), onCancel),
    [ask, leave],
  )

  // Frame links (tabs, brand, account menu) go through the guard while an edit has changes.
  const armGuard = useCallback(() => {
    if (!isEdit || !dirty.current) return
    useData.getState().setLeaveGuard((go) => askDiscard(go))
    // Browser Back: an extra history entry for this page catches it (§7.4.8 "browser Back").
    if (!sentinel.current) {
      window.history.pushState(null, '', window.location.href)
      sentinel.current = true
    }
  }, [isEdit, askDiscard])

  useEffect(() => {
    if (!isEdit) return
    const onPop = () => {
      if (pendingGo.current) {
        const go = pendingGo.current
        pendingGo.current = null
        // After Next has handled this history step, or its restore would undo our move.
        setTimeout(go, 0)
        return
      }
      if (!sentinel.current) return
      // Back left the sentinel: ask; Cancel puts it back, Discard goes back for real.
      sentinel.current = false
      askDiscard(
        () => window.history.back(),
        () => {
          window.history.pushState(null, '', window.location.href)
          sentinel.current = true
        },
      )
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      useData.getState().setLeaveGuard(null)
    }
  }, [isEdit, askDiscard])

  // ----- errors (§7.4.5) -----
  const showErr = (e: Err) => {
    if (e?.field && !FIELD_ID[e.field]) e = { message: e.message }
    if (e?.field && IN_MORE.has(e.field)) setD((p) => ({ ...p, moreOpen: true }))
    setErr(e)
  }
  useEffect(() => {
    if (!err) return
    if (err.field) {
      const el = document.getElementById(FIELD_ID[err.field])
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
    } else bannerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [err])

  const set = <K extends keyof DealDraft>(k: K, v: DealDraft[K]) => setD((p) => ({ ...p, [k]: v }))

  // ----- location suggestion (§7.4.2) -----
  const suggest = (p: LatLng | null, base: DealDraft): DealDraft => {
    if (!p || base.locManual || isEdit) return base
    const shown = new Set(locations.filter((l) => !l.hidden).map((l) => l.id))
    const candidates = [
      ...locations.filter((l) => !l.hidden).map((l) => ({ key: String(l.id), lat: l.lat, lng: l.lng })),
      ...deals.filter((x) => x.location.id !== null && shown.has(x.location.id)).map((x) => ({ key: String(x.location.id), lat: x.lat, lng: x.lng })),
    ]
    const h = suggestionHint(nearestPlace(p, candidates, metres))
    return { ...base, loc: h.key, hint: h.hint, hintWarn: h.warn }
  }

  const onPinText = (v: string) => {
    const p = parsePin(v)
    setD((prev) => suggest(pinOk(p) ? p : null, { ...prev, pin: v }))
  }
  const onMapPick = (p: LatLng) => {
    markDirty()
    armGuard()
    setD((prev) => suggest(p, { ...prev, pin: pinText(p.lat, p.lng) }))
    if (err?.field === 'pin') setErr(null)
  }

  // ----- add a place from the list (§7.4.2) -----
  const [placeOpen, setPlaceOpen] = useState(false)
  const [placeKey, setPlaceKey] = useState(0)
  const [placeErr, setPlaceErr] = useState('')
  const [placeBusy, setPlaceBusy] = useState(false)
  const onLocChange = (v: string) => {
    if (v === NEW_PLACE) {
      setPlaceErr('')
      setPlaceKey((k) => k + 1)
      setPlaceOpen(true)
      return
    }
    setD((p) => ({ ...p, loc: v, locManual: true, hint: '', hintWarn: false }))
  }
  const savePlace = async (pd: PlaceDraft) => {
    if (placeBusy) return
    setPlaceErr('')
    setPlaceBusy(true)
    const res = await api<{ location: LocationJSON }>('/api/locations', 'POST', { name: pd.name, kind: pd.kind, center: pd.center })
    setPlaceBusy(false)
    if (!res.ok) return setPlaceErr(res.status === 422 && res.message ? res.message : SETTINGS_COPY.saveFailed)
    await useData.getState().refresh()
    setD((p) => ({ ...p, loc: String(res.data.location.id), locManual: true, hint: 'just added', hintWarn: false }))
    markDirty()
    armGuard()
    setPlaceOpen(false)
    // The dialog unmounts here, so its close handler does not run: return focus ourselves.
    setTimeout(() => locRef.current?.focus(), 0)
  }

  // ----- leaving by Back or Cancel (§7.4.8) -----
  const hasText = TEXT_KEYS.some((k) => d[k].trim() !== '')
  const backOrCancel = () => {
    const goBack = () => router.push(lastView)
    if (isEdit) {
      if (dirty.current) askDiscard(goBack)
      else leave(goBack)
      return
    }
    const discard = () => {
      leaving.current = true
      useData.getState().setDraft(null)
      goBack()
    }
    if (hasText) ask('Discard this deal?', 'What you typed will be lost.', 'Discard', discard)
    else discard()
  }

  // ----- saving (§7.4.6) -----
  const toInput = (): DealInput => ({
    locationId: place ? place.id : null,
    legacyLocationName: legacyLoc,
    typeId: typeRow ? typeRow.id : null,
    legacyTypeName: legacyType,
    pin: d.pin, details: d.details, area: d.area, lotArea: d.lotArea, frontage: d.frontage, price: d.price, date: d.date,
    codeOrLink: d.codeOrLink, note: d.note, corner: d.corner, ridgeView: d.ridge, terrain: d.terrain, cond: d.cond, year: d.year,
    floor: d.floor, furn: d.furn, beds: d.beds, baths: d.baths, parking: d.parking, parkIncl: d.parkIncl, storeys: d.storeys,
    fin: d.fin, asking: d.asking, dom: d.dom,
  })

  const save = async (another: boolean) => {
    if (saving || !ready) return
    const input = toInput()
    const others = deals.map((x) => ({ id: x.id, locKey: refKey(x.location), details: x.details, price: x.price }))
    const e = checkDeal(input, { kind, type, locKey, others, editId: editId ?? null, today: manilaISO() })
    if (e) return showErr(e)
    setErr(null)
    setSaving(true)
    const res = isEdit ? await api<{ deal: DealJSON }>(`/api/deals/${editId}`, 'PUT', input) : await api<{ deal: DealJSON }>('/api/deals', 'POST', input)
    setSaving(false)
    if (!res.ok) {
      if (res.status === 422 && res.message) return showErr({ field: res.field, message: res.message })
      return showErr({ message: DEAL_COPY.saveFailed })
    }
    const deal = res.data.deal
    const st = useData.getState()
    st.upsertDeal(deal)
    if (isEdit) {
      toast(DEAL_COPY.updated(deal.location.name, deal.pp))
      st.setSelDeal(deal.id)
      leave(() => router.push('/deals'))
      return
    }
    toast(DEAL_COPY.saved(deal.location.name, deal.pp))
    if (another) {
      setD({ ...emptyDraft(), loc: d.loc, type: d.type, date: d.date, locManual: true })
      pinRef.current?.focus()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      leaving.current = true
      st.setDraft(null)
      router.push(lastView)
    }
  }

  // ----- select options -----
  const placeOpt = (l: LocationJSON) => (
    <option key={l.id} value={String(l.id)}>
      {l.name}
    </option>
  )
  const listed = (l: { hidden: boolean; id: number }, cur: string) => !l.hidden || isEdit || String(l.id) === cur
  const subs = locations.filter((l) => l.kind === 'Subdivision' && listed(l, d.loc))
  const zones = locations.filter((l) => l.kind === 'Zone' && listed(l, d.loc))
  const typeGroups = CATEGORIES.map((c) => [c, types.filter((t) => t.category === c && listed(t, d.type))] as const).filter(([, ts]) => ts.length)

  const fieldErr = (key: string) =>
    err?.field === key ? { 'aria-invalid': true as const, 'aria-describedby': `${FIELD_ID[key]}Err` } : {}
  const errMsg = (key: string): ReactNode =>
    err?.field === key ? (
      <span className="ferr" id={`${FIELD_ID[key]}Err`}>
        {err.message}
      </span>
    ) : null
  const clearErrFor = (id: string) => {
    if (err?.field && FIELD_ID[err.field] === id) setErr(null)
  }
  const sel = (opts: Opt[]) => [
    <option key="" value="">
      Select
    </option>,
    ...opts.map(([v, label]) => (
      <option key={v} value={v}>
        {label}
      </option>
    )),
  ]

  const head = isEdit ? PAGE_HEADS.edit : PAGE_HEADS.add
  const detailsPh = zone ? 'Street or landmark, such as corner of Tiano and Hayes' : condo ? 'Unit number, such as Tower 2, 14B' : 'Block and lot, such as B22 L27'

  return (
    <main className="addwrap">
      <div className="addhead">
        <a
          className="backlink"
          href={lastView}
          onClick={(e) => {
            e.preventDefault()
            backOrCancel()
          }}
        >
          <Icon name="back" />
          Back
        </a>
        <h1>{head.title}</h1>
        <p className="muted">{head.sub}</p>
      </div>
      {status === 'error' ? (
        <LoadError />
      ) : (
        <form
          className="stack"
          noValidate
          onChange={() => {
            markDirty()
            armGuard()
          }}
          onInput={(e) => {
            markDirty()
            armGuard()
            clearErrFor((e.target as HTMLElement).id)
          }}
          onSubmit={(e) => {
            e.preventDefault()
            void save(false)
          }}
        >
          <fieldset className="stack formset" disabled={!ready || !loaded}>
            <section className="card">
              <h3>Location</h3>
              <div className="pickgrid">
                <div className="stack" style={{ gap: 16 }}>
                  <label className="f" htmlFor="aPin">
                    <span className="lt">
                      Map pin (latitude, longitude) <InfoButton tip="pin" />
                    </span>
                    <input
                      ref={pinRef}
                      type="text"
                      className="mono"
                      id="aPin"
                      placeholder="Such as 8.48930, 124.66200"
                      autoComplete="off"
                      value={d.pin}
                      onChange={(e) => onPinText(e.target.value)}
                      {...fieldErr('pin')}
                    />
                    {errMsg('pin')}
                  </label>
                  <label className="f" htmlFor="aLoc">
                    <span className="lt">
                      Subdivision or area <InfoButton tip="kind" />{' '}
                      <span id="aLocHint" className={'rv' + (d.hintWarn ? ' warn' : '')} style={{ fontSize: 11, fontWeight: d.hintWarn ? 600 : 500 }}>
                        {d.hint}
                      </span>
                    </span>
                    <select ref={locRef} id="aLoc" value={d.loc} onChange={(e) => onLocChange(e.target.value)} {...fieldErr('locationId')}>
                      <option value="">Choose a location</option>
                      {subs.length > 0 && <optgroup label="Subdivisions and projects">{subs.map(placeOpt)}</optgroup>}
                      {zones.length > 0 && <optgroup label="Areas outside subdivisions">{zones.map(placeOpt)}</optgroup>}
                      {editDeal?.location.id === null && <option value={LEGACY}>{editDeal.location.name}</option>}
                      <optgroup label="Not on the list?">
                        <option value={NEW_PLACE}>+ Add a new subdivision or area</option>
                      </optgroup>
                    </select>
                    {errMsg('locationId')}
                  </label>
                  <p className="hint">Paste coordinates from the ERP213 map or Google Maps, or click the map. The location is suggested from the pin.</p>
                </div>
                <PinMap pin={mapPin} places={mapPlaces} dots={mapDots} chosenId={place?.id ?? null} label="Click to place the pin" onPick={onMapPick} />
              </div>
            </section>

            <section className="card">
              <h3>Sale details</h3>
              <div className="addgrid">
                <label className="f" htmlFor="aType">
                  Property type
                  <select
                    id="aType"
                    value={d.type}
                    onChange={(e) => {
                      const v = e.target.value
                      const t = types.find((x) => String(x.id) === v)
                      setD((p) => ({ ...p, type: v, beds: p.beds === '0' && t?.form !== 'condo' ? '' : p.beds }))
                    }}
                  >
                    {typeGroups.map(([c, ts]) => (
                      <optgroup key={c} label={c}>
                        {ts.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {editDeal?.type.id === null && <option value={LEGACY}>{editDeal.type.name}</option>}
                  </select>
                </label>
                <label className="f" htmlFor="aBL">
                  <span className="lt">
                    <span id="aBLL">Property details{zone ? ', optional' : ''}</span> <InfoButton tip="details" />
                  </span>
                  <input type="text" id="aBL" placeholder={detailsPh} autoComplete="off" maxLength={40} value={d.details} onChange={(e) => set('details', e.target.value)} {...fieldErr('details')} />
                  {errMsg('details')}
                </label>
                <label className="f" htmlFor="aArea">
                  <span className="lt">
                    <span id="aAreaL">{lot ? 'Lot area (sqm)' : 'Floor area (sqm)'}</span> <InfoButton tip="area" />
                  </span>
                  <input type="number" id="aArea" inputMode="decimal" min={1} step="any" placeholder="Such as 580" value={d.area} onChange={(e) => set('area', e.target.value)} {...fieldErr('area')} />
                  {errMsg('area')}
                </label>
                {house && (
                  <label className="f" htmlFor="aLotA">
                    <span className="lt">
                      Lot area (sqm) <InfoButton tip="lotarea" />
                    </span>
                    <input type="number" id="aLotA" inputMode="decimal" min={1} step="any" placeholder="Such as 300" value={d.lotArea} onChange={(e) => set('lotArea', e.target.value)} {...fieldErr('lotArea')} />
                    {errMsg('lotArea')}
                  </label>
                )}
                {hasRooms(type) && (
                  <label className="f" htmlFor="aBeds">
                    Bedrooms, optional
                    <select id="aBeds" value={d.beds} onChange={(e) => set('beds', e.target.value)}>
                      {sel(bedOpts(condo))}
                    </select>
                  </label>
                )}
                {lot && (
                  <label className="f" htmlFor="aFront">
                    <span className="lt">
                      <span id="aFrontL">Frontage (m){zone ? '' : ', optional'}</span> <InfoButton tip="frontage" />
                    </span>
                    <input type="number" id="aFront" inputMode="decimal" min={1} step="any" placeholder="Such as 20" value={d.frontage} onChange={(e) => set('frontage', e.target.value)} {...fieldErr('frontage')} />
                    {errMsg('frontage')}
                  </label>
                )}
                <label className="f" htmlFor="aPrice">
                  <span className="lt">
                    Sold price (₱) <InfoButton tip="sold" />
                  </span>
                  <input
                    type="text"
                    className="mono"
                    id="aPrice"
                    inputMode="numeric"
                    placeholder="Such as 21,500,000"
                    autoComplete="off"
                    value={d.price}
                    onChange={(e) => set('price', e.target.value)}
                    onBlur={(e) => set('price', commas(e.target.value))}
                    {...fieldErr('price')}
                  />
                  {errMsg('price')}
                </label>
                <label className="f" htmlFor="aDate">
                  <span className="lt">
                    Date sold <InfoButton tip="date" />
                  </span>
                  <input type="date" id="aDate" value={d.date} onChange={(e) => set('date', e.target.value)} {...fieldErr('date')} />
                  {errMsg('date')}
                </label>
              </div>

              <details className="more" id="aMore" open={d.moreOpen} onToggle={(e) => set('moreOpen', (e.target as HTMLDetailsElement).open)}>
                <summary>
                  <span>More details</span>
                  <span className="hint">Optional. Fill in what you know.</span>
                </summary>
                <div className="addgrid" style={{ paddingTop: 16 }}>
                  {lot && (
                    <div className="lotw full" id="aLotW" role="group" aria-labelledby="aLotL">
                      <span id="aLotL">Tick if it applies</span>
                      <div className="tags">
                        <label className="tag">
                          <input type="checkbox" id="aCorner" checked={d.corner} onChange={(e) => set('corner', e.target.checked)} /> Corner lot
                        </label>
                        <label className="tag">
                          <input type="checkbox" id="aRidge" checked={d.ridge} onChange={(e) => set('ridge', e.target.checked)} /> Ridge view
                        </label>
                      </div>
                    </div>
                  )}
                  {lot && (
                    <div className="lotw full" id="aGroundW" role="group" aria-labelledby="aGroundL">
                      <span id="aGroundL" className="lt">
                        Terrain and shape <InfoButton tip="terrain" />
                      </span>
                      <div className="tags seg">
                        {TERRAINS.map((t, i) => (
                          <label key={t} className="tag">
                            <input
                              type="radio"
                              name="terrain"
                              id={`aTerr${i + 1}`}
                              value={t}
                              checked={d.terrain === t}
                              onChange={() => set('terrain', t)}
                              onClick={() => {
                                // Tap again to clear (§7.4.3).
                                if (d.terrain === t) set('terrain', '')
                              }}
                            />{' '}
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {house && (
                    <label className="f" htmlFor="aCond">
                      Condition
                      <select id="aCond" value={d.cond} onChange={(e) => set('cond', e.target.value)}>
                        {sel(COND_OPTS)}
                      </select>
                    </label>
                  )}
                  {house && (
                    <label className="f" htmlFor="aYear">
                      Year built
                      <input type="number" id="aYear" inputMode="numeric" min={1900} max={2100} step={1} placeholder="Such as 2018" value={d.year} onChange={(e) => set('year', e.target.value)} {...fieldErr('year')} />
                      {errMsg('year')}
                    </label>
                  )}
                  {house && (
                    <label className="f" htmlFor="aStorey">
                      Storeys
                      <select id="aStorey" value={d.storeys} onChange={(e) => set('storeys', e.target.value)}>
                        {sel(STOREY_OPTS)}
                      </select>
                    </label>
                  )}
                  {condo && (
                    <label className="f" htmlFor="aFloor">
                      Floor level
                      <input type="number" id="aFloor" inputMode="numeric" min={1} max={100} step={1} placeholder="Such as 14" value={d.floor} onChange={(e) => set('floor', e.target.value)} {...fieldErr('floor')} />
                      {errMsg('floor')}
                    </label>
                  )}
                  {hasFurnish(type) && (
                    <label className="f" htmlFor="aFurn">
                      Furnishing
                      <select id="aFurn" value={d.furn} onChange={(e) => set('furn', e.target.value)}>
                        {sel(FURN_OPTS)}
                      </select>
                    </label>
                  )}
                  {hasRooms(type) && (
                    <label className="f" htmlFor="aBaths">
                      Bathrooms
                      <select id="aBaths" value={d.baths} onChange={(e) => set('baths', e.target.value)}>
                        {sel(BATH_OPTS)}
                      </select>
                    </label>
                  )}
                  {hasParking(type) && (
                    <label className="f" htmlFor="aPark">
                      Parking slots
                      <select id="aPark" value={d.parking} onChange={(e) => set('parking', e.target.value)}>
                        {sel(PARKING_OPTS)}
                      </select>
                    </label>
                  )}
                  {condo && (
                    <label className="f" htmlFor="aParkIncl">
                      <span className="lt">
                        Parking in the sold price? <InfoButton tip="parkincl" />
                      </span>
                      <select id="aParkIncl" value={d.parkIncl} onChange={(e) => set('parkIncl', e.target.value)}>
                        {sel(PARK_INCL_OPTS)}
                      </select>
                    </label>
                  )}
                  <label className="f" htmlFor="aAsking">
                    <span className="lt">
                      Last asking price (₱) <InfoButton tip="asking" />
                    </span>
                    <input
                      type="text"
                      className="mono"
                      id="aAsking"
                      inputMode="numeric"
                      placeholder="Such as 23,000,000"
                      autoComplete="off"
                      value={d.asking}
                      onChange={(e) => set('asking', e.target.value)}
                      onBlur={(e) => set('asking', commas(e.target.value))}
                      {...fieldErr('asking')}
                    />
                    {errMsg('asking')}
                  </label>
                  <label className="f" htmlFor="aFin">
                    <span className="lt">
                      Mode of payment <InfoButton tip="fin" />
                    </span>
                    <select id="aFin" value={d.fin} onChange={(e) => set('fin', e.target.value)}>
                      {sel(FIN_OPTS)}
                    </select>
                  </label>
                  <label className="f" htmlFor="aDom">
                    <span className="lt">
                      Days on market <InfoButton tip="dom" />
                    </span>
                    <input type="number" id="aDom" inputMode="numeric" min={0} max={3650} step={1} placeholder="Such as 95" value={d.dom} onChange={(e) => set('dom', e.target.value)} {...fieldErr('dom')} />
                    {errMsg('dom')}
                  </label>
                  <label className="f" htmlFor="aCode">
                    <span className="lt">
                      Listing code or link <InfoButton tip="code" />
                    </span>
                    <input type="text" id="aCode" placeholder="ZTP777 or a listing link" autoComplete="off" maxLength={400} value={d.codeOrLink} onChange={(e) => set('codeOrLink', e.target.value)} {...fieldErr('codeOrLink')} />
                    {errMsg('codeOrLink')}
                  </label>
                  <label className="f full" htmlFor="aNote">
                    <span className="lt">
                      Notes <InfoButton tip="note" />
                    </span>
                    <textarea
                      id="aNote"
                      rows={3}
                      maxLength={300}
                      placeholder="Anything that helps the team compare, such as beside the clubhouse or road widening planned"
                      value={d.note}
                      onChange={(e) => set('note', e.target.value)}
                    />
                  </label>
                </div>
              </details>
            </section>

            <div className="err" id="aErr" role="alert" ref={bannerRef} hidden={!err || !!err.field}>
              {err && !err.field ? err.message : ''}
            </div>

            <div className="savebar">
              <div className="savepreview" id="aPreview" aria-live="polite">
                {pv.kind === 'empty' ? (
                  <>
                    <span className="pp muted" style={{ fontSize: 14, fontWeight: 500 }}>
                      Price per sqm
                    </span>
                    <span className="note">Shows here once the area and sold price are in.</span>
                  </>
                ) : (
                  <>
                    <span className="pp">
                      {peso(pv.pp)}{' '}
                      <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                        per sqm
                      </span>
                    </span>
                    {pv.median !== null && pv.dev !== null && (
                      <span className={'note' + (pv.warn ? ' warn' : '')}>
                        {pv.warn ? (
                          <>
                            <strong>{previewWarning(pv.dev, pv.median).strong}</strong>
                            {previewWarning(pv.dev, pv.median).rest}
                          </>
                        ) : (
                          `Middle price here: ${peso(pv.median)} per sqm (${pv.n} deals).`
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="formrow">
                {isEdit && (
                  <button
                    className="btn danger"
                    type="button"
                    id="aDelete"
                    onClick={() => {
                      if (editDeal) deleteDeal(editDeal, () => leave(() => router.push('/deals')))
                    }}
                  >
                    Delete deal
                  </button>
                )}
                <button className="btn ghost" type="button" id="aClear" onClick={backOrCancel}>
                  Cancel
                </button>
                {!isEdit && (
                  <button className="btn" type="button" id="aSaveMore" disabled={saving} onClick={() => void save(true)}>
                    Save and add another
                  </button>
                )}
                <button className="btn primary" type="submit" id="aSave" disabled={saving}>
                  {isEdit ? 'Save changes' : 'Save deal'}
                </button>
              </div>
            </div>
          </fieldset>
        </form>
      )}
      {placeOpen && (
        <PlaceDialog
          key={placeKey}
          open={placeOpen}
          editing={null}
          error={placeErr}
          busy={placeBusy}
          initialCenter={mapPin ? pinText(mapPin.lat, mapPin.lng) : ''}
          subOverride={mapPin ? 'The map center is set to your pin. Move it to the middle of the subdivision or area if you can.' : undefined}
          onClose={() => {
            setPlaceOpen(false)
            locRef.current?.focus()
          }}
          onSubmit={(pd) => void savePlace(pd)}
          onInput={() => setPlaceErr('')}
        />
      )}
    </main>
  )
}
