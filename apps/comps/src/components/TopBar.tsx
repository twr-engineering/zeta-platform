'use client'

import Link from 'next/link'

import { GuardedLink, useGuard } from './GuardedLink'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Icon } from './Icon'
import { Logo } from './Logo'

const TABS = [
  { href: '/deals', label: 'Closed deals', icon: 'tabDeals' },
  { href: '/market-rates', label: 'Market rates', icon: 'tabRates' },
  { href: '/cma', label: 'CMA', icon: 'tabCma', title: 'Comparative Market Analysis' },
] as const

/** The top bar on every screen except Login (app PRD §6.2, §10.6.1, §10.6.2, §11.2). */
export function TopBar({ name }: { name: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const acct = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const onAddOrEdit = pathname === '/deals/new' || /^\/deals\/[^/]+\/edit$/.test(pathname)
  const initial = (name.trim()[0] || 'J').toUpperCase()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (acct.current && !acct.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const guard = useGuard()
  async function logOut() {
    setOpen(false)
    if (!(await guard())) return
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="top">
      <div className="wrap topin">
        <GuardedLink className="brand" href="/deals" aria-label="Zeta, closed deals">
          <Logo />
        </GuardedLink>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <GuardedLink key={t.href} className="tab" href={t.href} aria-current={pathname === t.href ? 'page' : undefined} title={'title' in t ? t.title : undefined}>
              <Icon name={t.icon} className="tabicon" />
              <span>{t.label}</span>
            </GuardedLink>
          ))}
        </nav>
        <div className="topright">
          {!onAddOrEdit && (
            <Link className="btn primary" href="/deals/new">
              + Add a deal
            </Link>
          )}
          <div className="acct" ref={acct}>
            <button
              ref={btn}
              className="avatarbtn"
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls="acctMenu"
              aria-label="Your account"
              onClick={() => setOpen((o) => !o)}
            >
              <span className="initial" aria-hidden="true">{initial}</span>
              <span className="caret" aria-hidden="true">
                <Icon name="chevronDown" />
              </span>
            </button>
            <div className="menu" id="acctMenu" role="menu" hidden={!open}>
              <div className="menuhead">
                <span className="initial big" aria-hidden="true">{initial}</span>
                <strong>{name}</strong>
                <span>Owner</span>
              </div>
              <GuardedLink className="menuitem" role="menuitem" href="/settings" onClick={() => setOpen(false)}>
                <Icon name="gear" />
                Settings
              </GuardedLink>
              <button type="button" className="menuitem" role="menuitem" onClick={logOut}>
                <Icon name="logout" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
