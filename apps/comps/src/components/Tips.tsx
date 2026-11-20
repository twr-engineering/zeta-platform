'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { TIPS, tipLabel, type TipKey } from '@/lib/tips'
import { Icon } from './Icon'

/** An "i" button (app PRD §6.5, §10.6.15). Inside a page title the CSS sizes it 24 px. */
export function InfoButton({ tip }: { tip: TipKey }) {
  return (
    <button type="button" className="info" data-tip={tip} aria-label={tipLabel(tip)} aria-expanded="false">
      <Icon name="info" />
    </button>
  )
}

/**
 * The one tooltip for every "i" button, with the reference build's behaviour (§6.5):
 * hover or focus shows it; click pins it; one at a time; closes on outside click, Escape
 * (focus back to the button), scroll, resize, route change, blur; lives inside an open
 * <dialog> when its button does, or the dialog's top layer would cover it.
 */
export function TipLayer() {
  const pathname = usePathname()

  useEffect(() => {
    const el = document.createElement('div')
    el.id = 'tip'
    el.setAttribute('role', 'tooltip')
    el.hidden = true
    document.body.appendChild(el)

    let tipFor: HTMLElement | null = null
    let pinned = false

    const infoOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest('.info[data-tip]') as HTMLElement | null) : null)

    const hide = () => {
      if (tipFor) {
        tipFor.setAttribute('aria-expanded', 'false')
        tipFor.removeAttribute('aria-describedby')
      }
      tipFor = null
      pinned = false
      el.hidden = true
    }
    const show = (btn: HTMLElement, pin: boolean) => {
      const t = TIPS[btn.dataset.tip as TipKey]
      if (!t) return
      if (tipFor && tipFor !== btn) hide()
      const host = btn.closest('dialog[open]') ?? document.body
      if (el.parentNode !== host) host.appendChild(el)
      el.replaceChildren()
      const strong = document.createElement('strong')
      strong.textContent = t[0]
      el.append(strong, t[1])
      el.hidden = false
      const r = btn.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12))
      let top = r.bottom + 8
      if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      tipFor = btn
      pinned = pinned || pin
      btn.setAttribute('aria-expanded', 'true')
      btn.setAttribute('aria-describedby', 'tip')
    }

    const onClick = (e: MouseEvent) => {
      const b = infoOf(e.target)
      if (b) {
        e.preventDefault()
        e.stopPropagation()
        if (tipFor === b && pinned) hide()
        else {
          pinned = false
          show(b, true)
        }
        return
      }
      if (tipFor) hide()
    }
    const onOver = (e: MouseEvent) => {
      const b = infoOf(e.target)
      if (b && !pinned) show(b, false)
    }
    const onOut = (e: MouseEvent) => {
      const b = infoOf(e.target)
      if (b && b === tipFor && !pinned && !b.contains(e.relatedTarget as Node | null)) hide()
    }
    const onFocusIn = (e: FocusEvent) => {
      const b = e.target instanceof HTMLElement && e.target.matches('.info[data-tip]') ? e.target : null
      if (b && !pinned) show(b, false)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (e.target === tipFor) hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tipFor) {
        const b = tipFor
        hide()
        b.focus()
      }
    }
    const onScrollOrResize = () => {
      if (tipFor) hide()
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('comps:route', onScrollOrResize)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('comps:route', onScrollOrResize)
      el.remove()
    }
  }, [])

  // Any route change closes an open tip.
  useEffect(() => {
    window.dispatchEvent(new Event('comps:route'))
  }, [pathname])

  return null
}
