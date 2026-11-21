'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { SETTINGS_COPY } from '@/lib/settings'

export type RowMenuTarget = { kind: 'loc' | 'type'; id: number; name: string; hidden: boolean; dealCount: number; button: HTMLButtonElement }

/**
 * The row action menu (app PRD §7.5.4): 6 px below the kebab, right-aligned (or above it when
 * there is no room), 8 px inside the window. Focus starts on the first item; Up/Down wrap;
 * Escape or Tab close and return focus to the kebab; outside click, scroll or resize close it.
 */
export function RowMenu({
  target,
  onClose,
  onEdit,
  onToggle,
  onDelete,
}: {
  target: RowMenuTarget
  onClose: (focusBack: boolean) => void
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const used = target.dealCount > 0

  useLayoutEffect(() => {
    const m = ref.current!
    const r = target.button.getBoundingClientRect()
    const mw = m.offsetWidth
    const mh = m.offsetHeight
    let top = r.bottom + 6
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6)
    m.style.top = `${top}px`
    m.style.left = `${Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8))}px`
    m.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [target])

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || target.button.contains(e.target as Node)) return
      onClose(false)
    }
    const away = () => onClose(false)
    document.addEventListener('click', outside)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('click', outside)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', away, true)
    }
  }, [target, onClose])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(ref.current!.querySelectorAll<HTMLElement>('[role=menuitem]'))
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length].focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      onClose(true)
    }
  }

  return (
    <div className="rowmenu" ref={ref} role="menu" aria-label="Row actions" onKeyDown={onKeyDown}>
      <button type="button" role="menuitem" onClick={onEdit}>
        Edit
      </button>
      <button type="button" role="menuitem" onClick={onToggle}>
        {target.hidden ? 'Show in the add form' : 'Hide from the add form'}
      </button>
      <div className="sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="danger"
        aria-disabled={used ? 'true' : undefined}
        onClick={() => {
          if (!used) onDelete() // the disabled item does nothing and leaves the menu open
        }}
      >
        Delete
        {used && <span className="why">{SETTINGS_COPY.usedBy(target.dealCount)}</span>}
      </button>
    </div>
  )
}
