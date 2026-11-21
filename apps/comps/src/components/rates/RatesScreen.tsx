'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { FilterBar } from '@/components/filters/FilterBar'
import { LoadError, TableSkeleton } from '@/components/LoadState'
import { InfoButton } from '@/components/Tips'
import { filtered } from '@/lib/filters'
import { manilaISO, peso } from '@/lib/format'
import { PERIOD, groupsOf, labelStep, trendPoints, yRange, type Group, type TrendBy } from '@/lib/rates'
import { MIN_DEALS } from '@/lib/stats'
import { useData } from '@/lib/store'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const onKeys = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/**
 * Market rates (app PRD §7.2): the filter bar, the rates table (one row per location and type,
 * ready rows first, waiting rows behind a toggle) and the trend card for the selected row.
 */
export function RatesScreen() {
  const status = useData((s) => s.status)
  const deals = useData((s) => s.deals)
  const types = useData((s) => s.types)
  const bar = useData((s) => s.bar)
  const selectedKey = useData((s) => s.selectedKey)
  const setSelectedKey = useData((s) => s.setSelectedKey)

  const groups = useMemo(() => groupsOf(filtered(deals, bar, types, manilaISO())), [deals, bar, types])
  // The selection survives filter changes while its row exists; else the first ready row (R6).
  const sel = groups.find((g) => g.key === selectedKey) ?? groups.find((g) => g.ok) ?? null
  useEffect(() => {
    if (status === 'ready' && (sel?.key ?? null) !== selectedKey) setSelectedKey(sel?.key ?? null)
  }, [status, sel, selectedKey, setSelectedKey])

  return (
    <>
      <FilterBar countSearch={false} />
      {status === 'error' ? (
        <LoadError />
      ) : (
        <>
          <section className="card" style={{ padding: 8 }}>
            {status === 'loading' ? <TableSkeleton rows={6} /> : <RatesTable groups={groups} sel={sel} anyDeals={deals.length > 0} />}
          </section>
          <TrendCard g={status === 'ready' ? sel : null} anyDeals={deals.length > 0} loading={status === 'loading'} />
        </>
      )}
    </>
  )
}

function RatesTable({ groups, sel, anyDeals }: { groups: Group[]; sel: Group | null; anyDeals: boolean }) {
  const showLow = useData((s) => s.showLow)
  const setShowLow = useData((s) => s.setShowLow)
  const setSelectedKey = useData((s) => s.setSelectedKey)
  const toggle = useRef<HTMLTableRowElement>(null)
  const ready = groups.filter((g) => g.ok)
  const waiting = groups.filter((g) => !g.ok)
  // A selected waiting row forces the toggle open, and it stays open after (as the reference build).
  const selWaiting = waiting.some((g) => g.key === sel?.key)
  const open = showLow || selWaiting
  useEffect(() => {
    if (selWaiting && !showLow) setShowLow(true)
  }, [selWaiting, showLow, setShowLow])

  const row = (g: Group) => (
    <tr
      key={g.key}
      className={'clickable' + (g.key === sel?.key ? ' sel' : '') + (g.ok ? '' : ' low')}
      data-key={g.key}
      tabIndex={0}
      aria-selected={g.key === sel?.key}
      onClick={() => setSelectedKey(g.key)}
      onKeyDown={onKeys(() => setSelectedKey(g.key))}
    >
      <td className="c-loc" title={g.loc}>
        <strong>{g.loc}</strong>
        {g.kind === 'Zone' && (
          <>
            {' '}
            <span className="pill">Area</span>
          </>
        )}
        <span className="m2 sub">
          {g.type} · {plural(g.n, 'deal')}
        </span>
      </td>
      <td className="c-type">
        {g.type}
        <span className="nar"> · {plural(g.n, 'deal')}</span>
      </td>
      <td className="r num c-n">{g.n}</td>
      {g.ok ? (
        <>
          <td className="r num c-mid">
            <strong>{peso(g.med)}</strong>
            <span className="m2 sub">
              {peso(g.p25)} to {peso(g.p75)}
            </span>
          </td>
          <td className="r num c-rng">
            <span className="nar">Price range </span>
            {peso(g.p25)} to {peso(g.p75)}
          </td>
          <td className="c-conf">
            <span className={`pill conf-${g.conf!.lvl.toLowerCase()}`}>{g.conf!.lvl} confidence</span>
          </td>
        </>
      ) : (
        <td colSpan={3} className="muted c-note">
          {g.n} of {MIN_DEALS} deals needed
        </td>
      )}
    </tr>
  )

  return (
    <div className="scroll">
      <table id="summary" className="tstack">
        <thead>
          <tr>
            <th>
              <span className="wide">Location</span>
              <span className="m2">Location and type</span>
            </th>
            <th className="c-type">Property type</th>
            <th className="r c-n">Deals</th>
            <th className="r">
              Middle price / sqm <InfoButton tip="middle" />
              <span className="m2">
                {' '}
                and range <InfoButton tip="range" />
              </span>
            </th>
            <th className="r c-rng">
              Price range / sqm <InfoButton tip="range" />
            </th>
            <th>
              Confidence <InfoButton tip="conf" />
            </th>
          </tr>
        </thead>
        <tbody>
          {!groups.length && (
            <tr>
              <td colSpan={6} className="muted c-all">
                {anyDeals ? 'No closed deals match these filters.' : 'No closed deals yet. Market rates show here once deals are added.'}
              </td>
            </tr>
          )}
          {ready.map(row)}
          {waiting.length > 0 && (
            <tr
              ref={toggle}
              className="clickable lowtoggle"
              id="lowToggle"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => setShowLow(!open)}
              onKeyDown={onKeys(() => setShowLow(!open))}
            >
              <td colSpan={6} className="c-all">
                {open ? 'Hide' : 'Show'} {plural(waiting.length, 'row')} with fewer than {MIN_DEALS} deals
              </td>
            </tr>
          )}
          {open && waiting.map(row)}
        </tbody>
      </table>
    </div>
  )
}

function TrendCard({ g, anyDeals, loading }: { g: Group | null; anyDeals: boolean; loading: boolean }) {
  const router = useRouter()
  const trendBy = useData((s) => s.trendBy)
  const setTrendBy = useData((s) => s.setTrendBy)
  const seeDeals = useData((s) => s.seeDeals)
  const opts: [TrendBy, string][] = [
    ['q', 'Quarter'],
    ['h', 'Half-year'],
    ['y', 'Year'],
  ]
  return (
    <section className="card" id="trendCard">
      <header>
        <span className="lt">
          <h2 className="cardtitle" id="trendTitle">
            {g ? `${g.loc}, ${g.type}` : 'Trend'}
          </h2>
          <InfoButton tip="trend" />
        </span>
        <div className="segb trendseg" role="radiogroup" aria-label="Group the trend by">
          {opts.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              data-tp={v}
              aria-checked={trendBy === v}
              onClick={(e) => {
                e.currentTarget.focus()
                setTrendBy(v)
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </header>
      <div id="trend">
        {loading ? null : !g ? (
          <p className="muted">{anyDeals ? 'Select a row with enough deals to see its trend.' : 'The price trend shows here once deals are added.'}</p>
        ) : !g.ok ? (
          <div className="empty">
            <strong>Not enough deals yet</strong>
            <span>
              A trend needs at least {MIN_DEALS} closed deals. This row has {g.n}.
            </span>
          </div>
        ) : (
          <TrendChart g={g} by={trendBy} />
        )}
      </div>
      {g && (
        <div className="trendfoot" id="trendFoot">
          <span>Based on {plural(g.n, 'closed deal')}. If one looks wrong, open it to edit or delete it.</span>
          <button
            type="button"
            className="link"
            id="seeDeals"
            onClick={() => {
              seeDeals(g.locKey, g.typeKey)
              router.push('/deals')
            }}
          >
            See the {plural(g.n, 'deal')}
          </button>
        </div>
      )}
    </section>
  )
}

/** The hand-drawn trend chart (§7.2.4), drawn at the card's real width. */
function TrendChart({ g, by }: { g: Group; by: TrendBy }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current!
    let t: ReturnType<typeof setTimeout> | null = null
    const measure = () => setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(measure, 150)
    })
    ro.observe(el)
    measure()
    return () => {
      ro.disconnect()
      if (t) clearTimeout(t)
    }
  }, [])

  const P = PERIOD[by]
  const { pts, cur } = trendPoints(g.list, by, manilaISO())
  const vals = pts.filter((p) => p.med !== null).map((p) => p.med!)
  if (vals.length < 2)
    return (
      <div ref={box}>
        <div className="empty">
          <strong>Not enough for a trend yet</strong>
          <span>
            A trend needs at least two {P.word}s with 2 or more deals each.{' '}
            {vals.length ? `Only one ${P.word} has that so far, at ${peso(vals[0])} per sqm.` : `No ${P.word} has that so far.`}
            {by !== 'y' ? ' Try a longer period.' : ''}
          </span>
        </div>
      </div>
    )

  const W = Math.max(340, Math.min(1400, width || 1000))
  const small = W < 600
  const H = small ? 220 : 260
  const L = 52
  const R = 16
  const T = 28
  const B = 34
  const pw = W - L - R
  const ph = H - T - B
  const [yMin, yMax] = yRange(vals)
  const X = (i: number) => L + pw * (i / (pts.length - 1))
  const Y = (v: number) => T + ph * (1 - (v - yMin) / (yMax - yMin))
  const last = pts.length - 1
  const lastPoint = pts.reduce((a, p, i) => (p.med !== null ? i : a), -1)
  const vMax = Math.max(...vals)
  const vMin = Math.min(...vals)
  const spacing = pw / Math.max(1, last)
  const step = labelStep(spacing)
  const anchor = (i: number) => (i === last ? 'end' : i === 0 ? 'start' : 'middle')

  let line = ''
  let started = false
  let dash = ''
  let prev: { i: number; v: number } | null = null
  pts.forEach((p, i) => {
    if (p.med === null) {
      started = false
      return
    }
    line += `${started ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.med).toFixed(1)} `
    started = true
    if (prev && i - prev.i > 1) dash += `M${X(prev.i).toFixed(1)} ${Y(prev.v).toFixed(1)} L${X(i).toFixed(1)} ${Y(p.med).toFixed(1)} `
    prev = { i, v: p.med }
  })
  const Word = P.word[0].toUpperCase() + P.word.slice(1)

  return (
    <div ref={box}>
      <div className="scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Middle price per sqm by ${P.word}`}>
          {[0, 1, 2, 3].map((t) => {
            const v = yMin + ((yMax - yMin) * t) / 3
            const y = Y(v)
            return (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--line)" />
                <text className="svgtext" x={L - 8} y={y + 4} textAnchor="end">
                  ₱{Math.round(v / 1000)}k
                </text>
              </g>
            )
          })}
          {dash && <path d={dash} fill="none" stroke="var(--mark)" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.6} className="gapline" />}
          <path d={line} fill="none" stroke="var(--mark)" strokeWidth={2} />
          {pts.map((p, i) => (
            <g key={p.q}>
              {(last - i) % step === 0 && (
                <text className="svgtext xlabel" x={X(i)} y={H - 12} textAnchor={anchor(i)}>
                  {P.label(p.q)}
                  {p.q === cur && step === 1 && spacing >= 110 ? ' so far' : ''}
                </text>
              )}
              {p.med !== null && (
                <>
                  <circle cx={X(i)} cy={Y(p.med)} r={5} fill="var(--brand)" stroke="var(--ink)" strokeWidth={1.5}>
                    <title>
                      {P.label(p.q)}: {peso(p.med)} per sqm from {p.n} deals
                    </title>
                  </circle>
                  {(!small || i === lastPoint || p.med === vMax || p.med === vMin) && (
                    <text className="svgtext" x={X(i)} y={Y(p.med) - 12} textAnchor={anchor(i)} style={{ fill: 'var(--ink)', fontWeight: 600 }}>
                      ₱{(p.med / 1000).toFixed(1)}k
                    </text>
                  )}
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="hint">
        Each point is the middle price of the deals sold that {P.word}. {Word}s with fewer than 2 deals are left out.
      </p>
    </div>
  )
}
