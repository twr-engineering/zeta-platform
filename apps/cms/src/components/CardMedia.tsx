'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

/**
 * The card image area of template 276562: [property_slider] (the listing's photos with ‹ ›
 * arrows) and [property_favourite] (the star). Only the shown photo is loaded; the arrows sit
 * outside the card link so they page photos instead of opening the listing.
 */
export function CardMedia({ href, label, images, ribbons }: { href: string; label: string; images: string[]; ribbons: string[] }) {
  const [i, setI] = useState(0)
  const n = images.length
  const step = (d: number) => setI((x) => (x + d + n) % n)
  return (
    <figure className="card-media">
      <Link href={href} className="card-link" aria-label={label} tabIndex={-1}>
        {n ? <Image src={images[i]} alt="" fill sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 300px" /> : <div className="card-noimg" />}
      </Link>
      {ribbons.length > 0 && (
        <div className="card-ribbons">{ribbons.map((r) => <span key={r} className="ribbon">{r}</span>)}</div>
      )}
      {/* Favourites need the account area (BPM-014): the star leads to sign-in until then. */}
      <Link href="/my-account/" className="card-fav" aria-label="Save to favourites">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      </Link>
      {n > 1 && (
        <>
          <button type="button" className="card-arrow is-prev" aria-label={`Previous photo (${i + 1} of ${n})`} onClick={() => step(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="card-arrow is-next" aria-label={`Next photo (${i + 1} of ${n})`} onClick={() => step(1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </>
      )}
    </figure>
  )
}
