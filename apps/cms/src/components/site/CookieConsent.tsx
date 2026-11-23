'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  OPEN_CONSENT_EVENT,
  serializeConsent,
  type Consent,
  type ConsentCategory,
} from '@/lib/site/consent'

const COPY: Record<ConsentCategory, { title: string; text: string }> = {
  analytics: { title: 'Analytics', text: 'Helps us see which pages and properties people look at, so we can improve the site.' },
  marketing: { title: 'Marketing', text: 'Lets us show relevant Zeta Group ads on other sites and measure them.' },
}

type Props = { categories: ConsentCategory[]; consent: Consent | null }

/**
 * FR-G10: a banner on the first visit (only when a tag is configured), granular categories, and a
 * persistent re-open control (the footer's "Cookie settings" dispatches OPEN_CONSENT_EVENT).
 * Saving sets the consent cookie and refreshes, so the server renders exactly the accepted tags.
 */
export function CookieConsent({ categories, consent }: Props) {
  const router = useRouter()
  const [bannerOpen, setBannerOpen] = useState(consent === null && categories.length > 0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [choice, setChoice] = useState<Record<ConsentCategory, boolean>>({
    analytics: consent?.analytics ?? false,
    marketing: consent?.marketing ?? false,
  })
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const open = () => setDialogOpen(true)
    window.addEventListener(OPEN_CONSENT_EVENT, open)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open)
  }, [])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (dialogOpen && !d.open) d.showModal()
    if (!dialogOpen && d.open) d.close()
  }, [dialogOpen])

  const save = (c: Record<ConsentCategory, boolean>) => {
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(c)}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    setChoice(c)
    setBannerOpen(false)
    setDialogOpen(false)
    router.refresh()
  }
  const all = (v: boolean) => ({ analytics: v && categories.includes('analytics'), marketing: v && categories.includes('marketing') })

  return (
    <>
      {bannerOpen && (
        <section className="consent-banner" aria-label="Cookie consent">
          <p>
            We use necessary cookies to run this site. With your permission we also use {categories.map((c) => COPY[c].title.toLowerCase()).join(' and ')} cookies.
          </p>
          <div className="consent-actions">
            <button type="button" className="btn btn-soft" onClick={() => setDialogOpen(true)}>Customise</button>
            <button type="button" className="btn btn-soft" onClick={() => save(all(false))}>Reject optional</button>
            <button type="button" className="btn btn-dark" onClick={() => save(all(true))}>Accept all</button>
          </div>
        </section>
      )}

      <dialog ref={dialogRef} className="consent-dialog" aria-labelledby="consent-title" onClose={() => setDialogOpen(false)}>
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault()
            save(choice)
          }}
        >
          <h2 id="consent-title">Cookie settings</h2>
          <div className="consent-row">
            <div>
              <h3>Necessary</h3>
              <p>Keeps the site working: your session, display currency and area unit. Always on.</p>
            </div>
            <input type="checkbox" checked disabled aria-label="Necessary cookies, always on" />
          </div>
          {categories.length === 0 && <p>This site uses no analytics or marketing cookies.</p>}
          {categories.map((c) => (
            <label key={c} className="consent-row">
              <div>
                <h3>{COPY[c].title}</h3>
                <p>{COPY[c].text}</p>
              </div>
              <input type="checkbox" checked={choice[c]} onChange={(e) => setChoice({ ...choice, [c]: e.target.checked })} />
            </label>
          ))}
          <div className="consent-actions">
            <button type="button" className="btn btn-soft" onClick={() => setDialogOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-dark">Save choices</button>
          </div>
        </form>
      </dialog>
    </>
  )
}

/** The footer's persistent re-open control. */
export function CookieSettingsLink() {
  return (
    <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Cookie settings
    </button>
  )
}
