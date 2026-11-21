'use client'

import { useRef, type KeyboardEvent } from 'react'

/**
 * The segmented control (app PRD §10.6.10): `role="radiogroup"` of `role="radio"` buttons, one
 * Tab stop (roving tabindex), Left/Right/Up/Down move and pick. With `optional`, pressing the
 * picked one (click or Space) clears it. `attrs` adds data-* attributes per button.
 */
export function SegButtons({
  options,
  value,
  onPick,
  optional = false,
  className = 'segb',
  label,
  labelledBy,
  attrs,
}: {
  options: readonly (readonly [string, string])[]
  value: string | undefined
  onPick: (v: string | undefined) => void
  optional?: boolean
  className?: string
  label?: string
  labelledBy?: string
  attrs?: (v: string) => Record<string, string>
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const picked = options.findIndex(([v]) => v === value)
  const stop = picked >= 0 ? picked : 0
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const j = (i + step + options.length) % options.length
    refs.current[j]?.focus()
    onPick(options[j][0])
  }
  return (
    <div className={className} role="radiogroup" aria-label={label} aria-labelledby={labelledBy}>
      {options.map(([v, l], i) => {
        const on = v === value
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === stop ? 0 : -1}
            {...attrs?.(v)}
            onClick={(e) => {
              // Focus stays on the pressed button, in WebKit too.
              e.currentTarget.focus()
              if (on) {
                if (optional) onPick(undefined)
              } else onPick(v)
            }}
            onKeyDown={(e) => onKey(e, i)}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}
