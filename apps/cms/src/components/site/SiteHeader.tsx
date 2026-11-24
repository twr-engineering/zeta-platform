'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

import { pending } from '@/lib/parity/pending'
import { LocationPicker } from '@/components/search/LocationPicker'
import type { AreaOption } from '@/lib/site/area-options'
import type { LocationGroup } from '@/lib/site/locations-menu'
import { setPreferences } from '@/lib/site/preferences'

export type MenuItem = { label: string; url: string; children?: { label: string; url: string }[] | null }

type Props = {
  menu: MenuItem[]
  cta: { label?: string | null; url?: string | null }
  locations: LocationGroup[]
  areaOptions: AreaOption[]
  currency: string
  currencies: readonly string[]
  measurement: 'metric' | 'imperial'
}

/**
 * WP-03 header (live zetagroup.ph, Nov 2026): logo, then — once the page scrolls, or on any page
 * other than the home hero — a search field and the "Sell with us" button; a menu button always.
 * The menu opens a right-hand drawer. FR-G01/G02/G05/G07/G11 controls live inside the drawer
 * (decision 23 Nov 2026), so nothing the PRD requires is lost and the live look is unchanged.
 */
export function SiteHeader({ menu, cta, locations, areaOptions, currency, currencies, measurement }: Props) {
  const path = usePathname()
  const overHero = path === '/'
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const button = menuButtonRef.current
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
      button?.focus()
    }
  }, [open])

  const solid = !overHero || scrolled

  return (
    <header className={`site-header${solid ? ' is-solid' : ''}${overHero ? ' is-overlay' : ''}`}>
      <div className="site-header-bar">
        <Link href="/" className="site-logo" aria-label="Zeta Group home">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark */}
          <img src="/zeta-logo-light.png" alt="" width={128} height={35} />
        </Link>
        {solid && (
          <Suspense fallback={<div className="location-picker" />}>
            <HeaderSearch options={areaOptions} />
          </Suspense>
        )}
        <div className="site-header-actions">
          {solid && cta.label && cta.url && (
            <Link href={cta.url} className="btn btn-soft site-cta">
              {cta.label}
            </Link>
          )}
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="site-drawer"
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      <div className={`drawer-backdrop${open ? ' is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav
        id="site-drawer"
        className={`drawer${open ? ' is-open' : ''}`}
        aria-label="Main menu"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="drawer-head">
          <h2>Menu</h2>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close menu" onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        <ul className="drawer-list">
          {menu.map((item) => (
            <DrawerItem key={item.label} item={item} active={isActive(path, item.url)} onNavigate={() => setOpen(false)} />
          ))}
          {locations.length > 0 && (
            <li>
              <Disclosure label="Locations">
                {locations.map((g) => (
                  <Disclosure key={g.key} label={g.label} nested>
                    {g.cities.map((c) => (
                      <div key={c.href} className="drawer-city">
                        <Link href={c.href} onClick={() => setOpen(false)}>{c.name}</Link>
                        {c.children.length > 0 && (
                          <ul>
                            {c.children.map((b) => (
                              <li key={b.href}><Link href={b.href} onClick={() => setOpen(false)}>{b.name}</Link></li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </Disclosure>
                ))}
              </Disclosure>
            </li>
          )}
        </ul>

        <form className="drawer-prefs" action={setPreferences}>
          <label>
            <span>Currency</span>
            <select name="currency" defaultValue={currency} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <fieldset className="seg" onChange={(e) => (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()}>
            <legend>Area</legend>
            <label><input type="radio" name="measurement" value="metric" defaultChecked={measurement === 'metric'} /><span>sqm</span></label>
            <label><input type="radio" name="measurement" value="imperial" defaultChecked={measurement === 'imperial'} /><span>sqft</span></label>
          </fieldset>
          <noscript><button className="btn btn-dark" type="submit">Apply</button></noscript>
        </form>

        <AccountLink onNavigate={() => setOpen(false)} />
      </nav>
    </header>
  )
}

function HeaderSearch({ options }: { options: AreaOption[] }) {
  pending('global-search-modal')
  return <LocationPicker options={options} />
}

function AccountLink({ onNavigate }: { onNavigate: () => void }) {
  pending('account-area-build')
  return (
    <Link href="/my-account/" className="btn btn-dark drawer-account" onClick={onNavigate}>
      Log in / Sign up
    </Link>
  )
}

function DrawerItem({ item, active, onNavigate }: { item: MenuItem; active: boolean; onNavigate: () => void }) {
  if (item.children?.length) {
    return (
      <li>
        <Disclosure label={item.label}>
          <ul className="drawer-sub">
            {item.children.map((c) => (
              <li key={c.url}><Link href={c.url} onClick={onNavigate}>{c.label}</Link></li>
            ))}
          </ul>
        </Disclosure>
      </li>
    )
  }
  return (
    <li>
      <Link href={item.url} className={`drawer-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
        {item.label}
      </Link>
    </li>
  )
}

function Disclosure({ label, nested, children }: { label: string; nested?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`disclosure${nested ? ' is-nested' : ''}`}>
      <button type="button" className="drawer-link disclosure-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        <span className="disclosure-sign" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="disclosure-panel">{children}</div>}
    </div>
  )
}

function isActive(path: string, url: string) {
  if (!url.startsWith('/')) return false
  return url === '/' ? path === '/' : path.startsWith(url)
}

const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
)
const CloseIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)
