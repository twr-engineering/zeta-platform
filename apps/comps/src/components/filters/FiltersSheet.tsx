'use client'

import { useEffect, useRef, useState } from 'react'

import {
  clampRange,
  filtered,
  rangeInfo,
  rangeText,
  searched,
  typeInfoOf,
  visibleDefs,
  type FDef,
  type Fx,
  type Range,
  type RangeInfo,
} from '@/lib/filters'
import { manilaISO } from '@/lib/format'
import { useData } from '@/lib/store'

/**
 * The Filters sheet (app PRD §7.1.6): only the filters that fit the type, sliders first, then
 * choice buttons (no "Any"; tap again to clear), then selects. Every change applies at once;
 * the button counts what the list will show (search included on Closed deals, R8).
 */
export function FiltersSheet({ open, countSearch, onClose }: { open: boolean; countSearch: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const bar = useData((s) => s.bar)
  const types = useData((s) => s.types)
  const deals = useData((s) => s.deals)
  const query = useData((s) => s.query)
  const setFx = useData((s) => s.setFx)

  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) {
      d.showModal()
      title.current?.focus()
    } else if (!open && d.open) d.close()
  }, [open])

  const t = typeInfoOf(bar.fType, types)
  const defs = visibleDefs(t)
  const list = filtered(deals, bar, types, manilaISO())
  const n = (countSearch ? searched(list, query.trim()) : list).length
  const put = (k: FDef['k'], v: Fx[FDef['k']] | undefined) => {
    const fx = { ...bar.fx }
    if (v === undefined || v === '') delete fx[k]
    else fx[k] = v
    setFx(fx)
  }

  return (
    <dialog
      ref={ref}
      id="filterDlg"
      className="sheet"
      aria-labelledby="filterT"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close()
      }}
    >
      <div className="sheethead">
        <h3 id="filterT" tabIndex={-1} ref={title}>
          Filters
        </h3>
        <button type="button" className="textbtn" id="fReset" onClick={() => setFx({})}>
          Reset
        </button>
      </div>
      <div className="sheetbody" id="filterBody">
        {open &&
          defs.map((d) =>
            d.kind === 'range' && t ? (
              <RangeSection key={`${bar.fType}-${d.k}`} def={d} info={rangeInfo(d, deals, bar.fType, t)} value={bar.fx[d.k] as Range | undefined} onChange={(v) => put(d.k, v)} />
            ) : (
              <div className="fsec" key={d.k}>
                <span className="k" id={`fk-${d.k}`}>
                  {d.label}
                  {d.sub && <small>{d.sub}</small>}
                </span>
                {d.kind === 'select' ? (
                  <select data-fk={d.k} aria-labelledby={`fk-${d.k}`} value={(bar.fx[d.k] as string) ?? ''} onChange={(e) => put(d.k, e.target.value)}>
                    {d.opts!.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="segb" role="radiogroup" aria-labelledby={`fk-${d.k}`}>
                    {d.opts!.map(([v, l]) => {
                      const on = bar.fx[d.k] === v
                      return (
                        <button key={v} type="button" role="radio" data-fk={d.k} data-v={v} aria-checked={on} onClick={(e) => {
                            // Focus returns to the pressed button (§7.1.6), in WebKit too.
                            e.currentTarget.focus()
                            put(d.k, on ? undefined : v)
                          }}>
                          {l}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ),
          )}
        <p className="fnote">
          {t
            ? 'Nothing picked means any. Tap a picked choice again to clear it. A filter leaves out deals where that detail was not recorded.'
            : 'Choose a property type to filter by bedrooms, lot area, frontage, parking and more.'}
        </p>
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn primary" id="fDone" onClick={() => ref.current?.close()}>
          Show {n} deal{n === 1 ? '' : 's'}
        </button>
      </div>
    </dialog>
  )
}

/** A dual range slider with histogram and Min/Max boxes (§7.1.6 "Range sliders"). */
function RangeSection({ def, info, value, onChange }: { def: FDef; info: RangeInfo; value: Range | undefined; onChange: (v: Range | undefined) => void }) {
  const [lo, hi] = value ?? [info.min, info.max]
  // The boxes hold what is typed until the change event applies it.
  const [box, setBox] = useState<{ lo: string; hi: string } | null>(null)
  const name = def.label.toLowerCase()
  const span = info.max - info.min
  const pa = ((lo - info.min) / span) * 100
  const pb = ((hi - info.min) / span) * 100
  const mx = Math.max(...info.bins) || 1
  const apply = (a: number, b: number) => onChange(clampRange(info, a, b))
  return (
    <div className="fsec" data-range={def.k}>
      <span className="k" id={`fk-${def.k}`}>
        {def.label}
        <small className="rvt">{rangeText(info, lo, hi)}</small>
      </span>
      {info.n >= 2 && (
        <div className="hist" aria-hidden="true">
          {info.bins.map((c, i) => {
            const mid = ((i + 0.5) / 24) * 100
            return <i key={i} className={mid >= pa && mid <= pb ? 'in' : undefined} style={{ height: `${c ? 8 + (c / mx) * 92 : 0}%` }} />
          })}
        </div>
      )}
      <div className="dual">
        <div className="trk" />
        <div className="fill" style={{ left: `${pa}%`, right: `${100 - pb}%` }} />
        <input type="range" className="lo" min={info.min} max={info.max} step={info.step} value={lo} aria-label={`Minimum ${name}`} onChange={(e) => apply(Math.min(Number(e.target.value), hi), hi)} />
        <input type="range" className="hi" min={info.min} max={info.max} step={info.step} value={hi} aria-label={`Maximum ${name}`} onChange={(e) => apply(lo, Math.max(Number(e.target.value), lo))} />
      </div>
      <div className="mm">
        <label>
          Min
          <input
            type="number"
            className="nlo"
            inputMode="numeric"
            value={box?.lo ?? String(lo)}
            onChange={(e) => setBox({ lo: e.target.value, hi: box?.hi ?? String(hi) })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={() => {
              if (!box) return
              apply(box.lo === '' ? info.min : Number(box.lo), hi)
              setBox(null)
            }}
          />
        </label>
        <span aria-hidden="true">to</span>
        <label>
          Max
          <input
            type="number"
            className="nhi"
            inputMode="numeric"
            value={box?.hi ?? String(hi)}
            onChange={(e) => setBox({ lo: box?.lo ?? String(lo), hi: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={() => {
              if (!box) return
              apply(lo, box.hi === '' ? info.max : Number(box.hi))
              setBox(null)
            }}
          />
        </label>
      </div>
    </div>
  )
}
