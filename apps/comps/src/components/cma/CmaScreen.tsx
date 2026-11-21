'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import { InfoButton } from '@/components/Tips'
import { useToast } from '@/components/Toast'
import { LoadError } from '@/components/LoadState'
import { description, locCenter, runCma, searchSummary, type Subject } from '@/lib/cma'
import type { LocationJSON, TypeJSON } from '@/lib/data'
import { bedsLabel } from '@/lib/details'
import {
  BATH_OPTS,
  COND_OPTS,
  FURN_OPTS,
  LEGACY_TYPE,
  PARKING_OPTS,
  PARK_INCL_OPTS,
  TERRAINS,
  bedOpts,
  commas,
  digits,
  firstShownType,
  hasFurnish,
  hasParking,
  hasRooms,
  type Opt,
  type TypeInfo,
} from '@/lib/deals'
import { confReason } from '@/lib/filters'
import { distanceLabel, fmtDate, fmtMonth, manilaISO, peso, pesoShort, pinText } from '@/lib/format'
import { CATEGORIES, parsePin, pinOk } from '@/lib/settings'
import { MIN_DEALS } from '@/lib/stats'
import { useData, type CmaForm } from '@/lib/store'

import { CmaMap } from './CmaMap'

const n = (x: number) => x.toLocaleString('en-US')
const num = (v: string) => Math.max(0, parseFloat(v) || 0)
const int = (v: string) => (v === '' ? null : parseInt(v, 10))
const BAD_PIN = 'That pin is not valid. Use latitude, longitude inside Cagayan de Oro.'

/** The starting subject (R11): first shown place and type, nothing filled, the pin at the place's center. */
function startForm(locations: LocationJSON[], types: TypeJSON[], deals: Parameters<typeof locCenter>[1]): CmaForm | null {
  const loc = locations.find((l) => !l.hidden) ?? locations[0]
  const type = firstShownType(types)
  if (!loc || !type) return null
  const c = locCenter(`id:${loc.id}`, deals, locations, { lat: loc.lat, lng: loc.lng })
  return {
    loc: `id:${loc.id}`, type: `id:${type.id}`, area: '', lotArea: '', frontage: '', corner: false, ridge: false, terrain: '', beds: '', baths: '', parking: '',
    parkIncl: '', cond: '', year: '', floor: '', furn: '', asking: '', pin: pinText(c.lat, c.lng), lat: c.lat, lng: c.lng, moreOpen: false, searchOpen: false,
    locShown: true, typeShown: true,
  }
}

/** The subject the rules run on: fields that do not apply to the type are left out. */
function toSubject(f: CmaForm, t: TypeJSON | undefined): Subject {
  const type: TypeInfo = t ? { form: t.form, category: t.category } : LEGACY_TYPE
  const lot = type.form === 'lot'
  const house = type.form === 'house'
  const condo = type.form === 'condo'
  const parking = hasParking(type) ? int(f.parking) : null
  const asking = digits(f.asking)
  return {
    typeKey: f.type,
    typeName: t?.name ?? '',
    type,
    area: num(f.area),
    lotArea: house ? num(f.lotArea) : 0,
    frontage: lot ? num(f.frontage) : 0,
    corner: lot && f.corner,
    ridge: lot && f.ridge,
    terrain: lot ? f.terrain : '',
    beds: hasRooms(type) ? int(f.beds) : null,
    baths: hasRooms(type) ? int(f.baths) : null,
    parking,
    parkIncl: condo && parking ? f.parkIncl : '',
    cond: house ? f.cond : '',
    year: house ? int(f.year) : null,
    floor: condo ? int(f.floor) : null,
    furn: hasFurnish(type) ? f.furn : '',
    asking: asking > 0 ? asking : 0,
    lat: f.lat,
    lng: f.lng,
  }
}

/** CMA (app PRD §7.3): the property card, the result card and the comps card with the map. */
export function CmaScreen() {
  const toast = useToast()
  const status = useData((s) => s.status)
  const deals = useData((s) => s.deals)
  const locations = useData((s) => s.locations)
  const types = useData((s) => s.types)
  const form = useData((s) => s.cma)
  const setCma = useData((s) => s.setCma)
  const settings = useData((s) => s.cmaSettings)
  const setSettings = useData((s) => s.setCmaSettings)
  const radiusRef = useRef<HTMLInputElement>(null)

  // Start once the bootstrap is in; follow Settings changes (§7.3.5).
  useEffect(() => {
    if (status !== 'ready') return
    const f = useData.getState().cma
    if (!f) {
      setCma(startForm(locations, types, deals))
      return
    }
    const loc = locations.find((l) => `id:${l.id}` === f.loc)
    const type = types.find((t) => `id:${t.id}` === f.type)
    // Deleted, or hidden since it was last seen shown: fall back to the first shown one.
    // (A hidden one picked by hand stays: hiding only affects the add form.)
    const locGone = !loc || (loc.hidden && f.locShown)
    const typeGone = !type || (type.hidden && f.typeShown)
    const start = locGone || typeGone ? startForm(locations, types, deals) : null
    const next: CmaForm = {
      ...f,
      ...(start && locGone ? { loc: start.loc, lat: start.lat, lng: start.lng, pin: start.pin } : {}),
      ...(start && typeGone ? { type: start.type, area: '', lotArea: '', frontage: '' } : {}),
    }
    const nl = locations.find((l) => `id:${l.id}` === next.loc)
    const nt = types.find((t) => `id:${t.id}` === next.type)
    next.locShown = !!nl && !nl.hidden
    next.typeShown = !!nt && !nt.hidden
    if (next.loc !== f.loc || next.type !== f.type || next.locShown !== f.locShown || next.typeShown !== f.typeShown) setCma(next)
  }, [status, locations, types, deals, setCma])

  if (status === 'error') return <LoadError />
  const f = form
  const typeRow = f ? types.find((t) => `id:${t.id}` === f.type) : undefined
  const subj = f ? toSubject(f, typeRow) : null
  const cma = subj ? runCma(subj, deals, settings, manilaISO()) : null
  const set = (patch: Partial<CmaForm>) => f && setCma({ ...f, ...patch })
  const lot = subj?.type.form === 'lot'
  const house = subj?.type.form === 'house'
  const condo = subj?.type.form === 'condo'
  const radTxt = distanceLabel(settings.radius)

  const moveTo = (p: { lat: number; lng: number }) => set({ lat: p.lat, lng: p.lng, pin: pinText(p.lat, p.lng) })

  return (
    <div className="valgrid">
      <section className="card">
        <h2 className="cardtitle">The property</h2>
        <fieldset className="formset" disabled={!f}>
          <div className="fields">
            <label className="f full" htmlFor="sLoc">
              <span className="lt">
                Subdivision or area <InfoButton tip="kind" />
              </span>
              <select
                id="sLoc"
                value={f?.loc ?? ''}
                onChange={(e) => {
                  if (!f) return
                  const c = locCenter(e.target.value, deals, locations, f)
                  const picked = locations.find((l) => `id:${l.id}` === e.target.value)
                  set({ loc: e.target.value, lat: c.lat, lng: c.lng, pin: pinText(c.lat, c.lng), locShown: !!picked && !picked.hidden })
                }}
              >
                {(['Subdivision', 'Zone'] as const).map((k) => {
                  const ls = locations.filter((l) => l.kind === k)
                  return ls.length ? (
                    <optgroup key={k} label={k === 'Subdivision' ? 'Subdivisions and projects' : 'Areas outside subdivisions'}>
                      {ls.map((l) => (
                        <option key={l.id} value={`id:${l.id}`}>
                          {l.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </select>
            </label>
            <label className="f full" htmlFor="sType">
              Property type
              <select
                id="sType"
                value={f?.type ?? ''}
                onChange={(e) => {
                  if (!f) return
                  const next = types.find((t) => `id:${t.id}` === e.target.value)
                  // A size typed for a lot means nothing for a condo: a change of form clears the sizes (R11).
                  const sizes = next?.form !== typeRow?.form ? { area: '', lotArea: '', frontage: '' } : {}
                  set({ type: e.target.value, ...sizes, beds: f.beds === '0' && next?.form !== 'condo' ? '' : f.beds, typeShown: !!next && !next.hidden })
                }}
              >
                {CATEGORIES.map((c) => {
                  const ts = types.filter((t) => t.category === c)
                  return ts.length ? (
                    <optgroup key={c} label={c}>
                      {ts.map((t) => (
                        <option key={t.id} value={`id:${t.id}`}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </select>
            </label>
            <label className="f" htmlFor="sArea">
              <span id="sAreaL">{lot ? 'Lot area (sqm)' : 'Floor area (sqm)'}</span>
              <input type="number" id="sArea" inputMode="decimal" min={1} step="any" value={f?.area ?? ''} onChange={(e) => set({ area: e.target.value })} />
            </label>
            {house && (
              <label className="f" htmlFor="sLotA">
                Lot area (sqm)
                <input type="number" id="sLotA" inputMode="decimal" min={1} step="any" placeholder="Optional" value={f?.lotArea ?? ''} onChange={(e) => set({ lotArea: e.target.value })} />
              </label>
            )}
            {subj && hasRooms(subj.type) && (
              <label className="f" htmlFor="sBeds">
                Bedrooms
                <select id="sBeds" value={f?.beds ?? ''} onChange={(e) => set({ beds: e.target.value })}>
                  {sel(bedOpts(!!condo))}
                </select>
              </label>
            )}
            {lot && (
              <label className="f" htmlFor="sFront">
                Frontage (m)
                <input type="number" id="sFront" inputMode="decimal" min={0} step="any" value={f?.frontage ?? ''} onChange={(e) => set({ frontage: e.target.value })} />
              </label>
            )}
            {lot && (
              <div className="lotw full" id="sCornerW" role="group" aria-labelledby="sLotL">
                <span id="sLotL" className="lt">
                  Tick if it applies <InfoButton tip="features" />
                </span>
                <div className="tags">
                  <label className="tag">
                    <input type="checkbox" id="sCorner" checked={!!f?.corner} onChange={(e) => set({ corner: e.target.checked })} /> Corner lot
                  </label>
                  <label className="tag">
                    <input type="checkbox" id="sRidge" checked={!!f?.ridge} onChange={(e) => set({ ridge: e.target.checked })} /> Ridge view
                  </label>
                </div>
              </div>
            )}
            {lot && (
              <div className="lotw full" id="sGroundW" role="group" aria-labelledby="sGroundL">
                <span id="sGroundL" className="lt">
                  Terrain and shape <InfoButton tip="terrain" />
                </span>
                <div className="tags seg">
                  {TERRAINS.map((t, i) => (
                    <label key={t} className="tag">
                      <input
                        type="radio"
                        name="sTerrain"
                        id={`sTerr${i + 1}`}
                        value={t}
                        checked={f?.terrain === t}
                        onChange={() => set({ terrain: t })}
                        onClick={() => {
                          if (f?.terrain === t) set({ terrain: '' })
                        }}
                      />{' '}
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="f full" htmlFor="sAsking">
              Seller&apos;s asking price (₱)
              <input
                type="text"
                className="mono"
                id="sAsking"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Optional"
                value={f?.asking ?? ''}
                onChange={(e) => set({ asking: e.target.value })}
                onBlur={(e) => set({ asking: commas(e.target.value) })}
              />
            </label>
            <label className="f full" htmlFor="sPin">
              <span className="lt">
                Map pin (latitude, longitude) <InfoButton tip="pin" />
              </span>
              <input
                type="text"
                className="mono"
                id="sPin"
                autoComplete="off"
                value={f?.pin ?? ''}
                onChange={(e) => set({ pin: e.target.value })}
                onBlur={(e) => applyPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyPin(e.currentTarget.value)}
              />
            </label>
          </div>

          {!lot && subj && (
            <details className="more" id="sMore" open={!!f?.moreOpen} onToggle={(e) => set({ moreOpen: (e.target as HTMLDetailsElement).open })}>
              <summary>
                <span>More details</span>
                <span className="searchsum">Optional. Adds notes, never removes comps.</span>
              </summary>
              <div className="fields" style={{ paddingTop: 16 }}>
                {hasRooms(subj.type) && (
                  <Sel id="sBaths" label="Bathrooms" value={f?.baths ?? ''} opts={BATH_OPTS} onChange={(v) => set({ baths: v })} />
                )}
                {hasParking(subj.type) && <Sel id="sPark" label="Parking slots" value={f?.parking ?? ''} opts={PARKING_OPTS} onChange={(v) => set({ parking: v })} />}
                {condo && (
                  <Sel id="sParkIncl" label="Parking in the price?" full value={f?.parkIncl ?? ''} opts={PARK_INCL_OPTS} onChange={(v) => set({ parkIncl: v as CmaForm['parkIncl'] })} />
                )}
                {house && <Sel id="sCond" label="Condition" value={f?.cond ?? ''} opts={COND_OPTS} onChange={(v) => set({ cond: v as CmaForm['cond'] })} />}
                {house && (
                  <label className="f" htmlFor="sYear">
                    Year built
                    <input type="number" id="sYear" inputMode="numeric" min={1900} max={2100} step={1} placeholder="Such as 2018" value={f?.year ?? ''} onChange={(e) => set({ year: e.target.value })} />
                  </label>
                )}
                {condo && (
                  <label className="f" htmlFor="sFloor">
                    Floor level
                    <input type="number" id="sFloor" inputMode="numeric" min={1} max={100} step={1} placeholder="Such as 14" value={f?.floor ?? ''} onChange={(e) => set({ floor: e.target.value })} />
                  </label>
                )}
                {hasFurnish(subj.type) && <Sel id="sFurn" label="Furnishing" value={f?.furn ?? ''} opts={FURN_OPTS} onChange={(v) => set({ furn: v as CmaForm['furn'] })} />}
              </div>
            </details>
          )}

          <details className="more" id="rMore" open={!!f?.searchOpen} onToggle={(e) => set({ searchOpen: (e.target as HTMLDetailsElement).open })}>
            <summary>
              <span>Search settings</span>
              <span className="searchsum" id="rSum">
                {searchSummary(settings, !!cma?.like)}
              </span>
            </summary>
            <div className="fields" style={{ paddingTop: 16 }}>
              <label className="f full" htmlFor="rRadius">
                <span className="lt">
                  Distance from the property{' '}
                  <span className="rv" id="rRadiusV">
                    {radTxt}
                  </span>{' '}
                  <InfoButton tip="radius" />
                </span>
                <input
                  ref={radiusRef}
                  type="range"
                  id="rRadius"
                  min={250}
                  max={1500}
                  step={250}
                  value={settings.radius}
                  onChange={(e) => setSettings({ ...settings, radius: Number(e.target.value) })}
                />
              </label>
              <label className="f full" htmlFor="rMonths">
                <span className="lt">
                  Sold within <InfoButton tip="months" />
                </span>
                <select id="rMonths" value={settings.months} onChange={(e) => setSettings({ ...settings, months: Number(e.target.value) })}>
                  {[6, 12, 24, 36].map((m) => (
                    <option key={m} value={m}>
                      Last {m} months
                    </option>
                  ))}
                </select>
              </label>
              {cma && cma.crit.length > 0 && (
                <label className="chkrow full" htmlFor="rLike" id="rLikeWrap">
                  <input type="checkbox" id="rLike" checked={settings.similar} onChange={(e) => setSettings({ ...settings, similar: e.target.checked })} />{' '}
                  <span id="rLikeT">Only similar properties: {cma.crit.join(', ')}</span> <InfoButton tip="similar" />
                </label>
              )}
            </div>
          </details>
        </fieldset>
      </section>

      <div className="stack">
        <section className="card">
          <div className="result" id="result">
            {subj && cma ? (
              <Result
                subj={subj}
                cma={cma}
                radTxt={radTxt}
                onWiden={() => {
                  set({ searchOpen: true })
                  setTimeout(() => radiusRef.current?.focus(), 0)
                }}
              />
            ) : (
              <div className="skel" style={{ height: 64 }} aria-hidden="true" />
            )}
          </div>
        </section>
        <section className="card">
          <header>
            <span className="lt">
              <h2 className="cardtitle" id="nearTitle">
                {cma && cma.inside.length ? `${cma.inside.length} comp${cma.inside.length === 1 ? '' : 's'} within ${radTxt}` : 'Comps nearby'}
              </h2>
              <InfoButton tip="comps" />
            </span>
            <p>Click the map to move the property</p>
          </header>
          {f && cma ? (
            <CmaMap subject={{ lat: f.lat, lng: f.lng }} radius={settings.radius} inside={cma.inside} tooFar={cma.tooFar} onMove={moveTo} />
          ) : (
            <div className="zmap cmamap" aria-hidden="true" />
          )}
          <div className="legend">
            <span className="a">Comp within the distance</span>
            <span className="b">Too far</span>
            <span className="c">This property</span>
          </div>
          {subj && cma && <CompsTable subj={subj} inside={cma.inside} />}
        </section>
      </div>
    </div>
  )

  function applyPin(text: string) {
    if (!f) return
    const p = parsePin(text)
    if (pinOk(p)) {
      if (p.lat !== f.lat || p.lng !== f.lng) set({ lat: p.lat, lng: p.lng, pin: text })
      return
    }
    set({ pin: pinText(f.lat, f.lng) })
    toast(BAD_PIN)
  }
}

function sel(opts: Opt[]): ReactNode[] {
  return [
    <option key="" value="">
      Select
    </option>,
    ...opts.map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    )),
  ]
}

function Sel({ id, label, value, opts, full, onChange }: { id: string; label: string; value: string; opts: Opt[]; full?: boolean; onChange: (v: string) => void }) {
  return (
    <label className={'f' + (full ? ' full' : '')} htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {sel(opts)}
      </select>
    </label>
  )
}

function Result({ subj, cma, radTxt, onWiden }: { subj: Subject; cma: ReturnType<typeof runCma>; radTxt: string; onWiden: () => void }) {
  const r = cma.result
  const lot = subj.type.form === 'lot'
  if (r.kind === 'noarea')
    return (
      <>
        <div className="eyebrow">{subj.typeName}</div>
        <div className="big muted" style={{ fontSize: 24 }}>
          Enter the {lot ? 'lot' : 'floor'} area to see a value
        </div>
      </>
    )
  if (r.kind === 'few')
    return (
      <>
        <div className="eyebrow">{description(subj)}</div>
        <div className="big" style={{ fontSize: 24 }}>
          Not enough comps yet
        </div>
        <p className="muted">
          {r.n} of the {MIN_DEALS} needed {subj.typeName.toLowerCase()} deals are within {radTxt}
          {cma.like ? ' and similar to this one' : ''}.
        </p>
        <p>
          <button type="button" className="link" id="widenBtn" onClick={onWiden}>
            Change search settings
          </button>
        </p>
      </>
    )
  return (
    <>
      <div className="eyebrow">
        <span className="lt">
          Estimated price for {description(subj)} <InfoButton tip="estimate" />
        </span>
      </div>
      <div className="big">
        {pesoShort(r.low)} to {pesoShort(r.high)}
      </div>
      <div className="confline">
        <span className={`pill conf-${r.conf.lvl.toLowerCase()}`}>{r.conf.lvl} confidence</span>
        <InfoButton tip="conf" />
        <span>{confReason(r.conf, `comps within ${radTxt}`)}</span>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="k">Middle estimate</span>
          <span className="v">{pesoShort(r.mid)}</span>
        </div>
        <div className="stat">
          <span className="k">
            <span className="lt">
              Middle price / sqm <InfoButton tip="middle" />
            </span>
          </span>
          <span className="v">{peso(r.med)}</span>
        </div>
        {r.asking && (
          <div className="stat">
            <span className="k">Seller&apos;s asking price</span>
            <span className="v">
              {pesoShort(subj.asking)}{' '}
              <small>
                {r.asking.pct}% {r.asking.dir} the middle estimate
              </small>
            </span>
          </div>
        )}
      </div>
      {r.notes.map((t) => (
        <p key={t} className="resnote">
          {t}
        </p>
      ))}
    </>
  )
}

/** The comps table (§7.3.4): every comp in the title, nearest first (R7). */
function CompsTable({ subj, inside }: { subj: Subject; inside: ReturnType<typeof runCma>['inside'] }) {
  const lot = subj.type.form === 'lot'
  const house = subj.type.form === 'house'
  const extraHead = lot ? 'Frontage' : house ? 'Lot area' : 'Bedrooms'
  const extra = (d: (typeof inside)[number]['d']) =>
    lot ? (d.frontage ? `${n(d.frontage)} m${d.corner ? ' *' : ''}` : 'n/a') : house ? (d.lotArea ? `${n(d.lotArea)} sqm` : 'n/a') : d.beds !== null ? bedsLabel(d.beds) : 'n/a'
  return (
    <div className="scroll">
      <table id="near" className="tstack">
        <thead>
          <tr>
            <th>Distance</th>
            <th>Location</th>
            <th>Date sold</th>
            <th className="r">{lot ? 'Lot area' : 'Floor area'}</th>
            <th className="r">{extraHead}</th>
            <th className="r">Per sqm</th>
          </tr>
        </thead>
        <tbody>
          {!inside.length && (
            <tr>
              <td colSpan={6} className="muted">
                No deals inside this radius.
              </td>
            </tr>
          )}
          {inside.map(({ d, dist }) => (
            <tr key={d.id}>
              <td className="num n-away">{Math.round(dist)} m</td>
              <td className="n-loc" title={d.location.name + (d.details ? ` · ${d.details}` : '')}>
                {d.location.name}
                {d.details && <span className="nar"> · {d.details}</span>}
              </td>
              <td className="n-sold">
                <span className="wid">{fmtDate(d.date)}</span>
                <span className="nar">{fmtMonth(d.date)}</span>
              </td>
              <td className="r num n-area">{n(d.area)} sqm</td>
              <td className="r num n-extra">
                {extra(d)}
                {extraHead !== 'Bedrooms' && <span className="nar"> {lot ? 'frontage' : 'lot'}</span>}
              </td>
              <td className="r num n-pp">{peso(d.pp)}</td>
            </tr>
          ))}
        </tbody>
        {inside.some((x) => x.d.corner) && <caption style={{ captionSide: 'bottom', textAlign: 'left', fontSize: 12, color: 'var(--muted)', paddingTop: 6 }}>* corner lot</caption>}
      </table>
    </div>
  )
}
