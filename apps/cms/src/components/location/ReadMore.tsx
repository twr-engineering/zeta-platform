'use client'

import { useState, type ReactNode } from 'react'

/** The location description: the part before the live "Read more" button, then the rest on demand. */
export function ReadMore({ intro, more }: { intro: ReactNode; more: ReactNode | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="loc-desc">
      {intro}
      {more && open && more}
      {more && (
        <button type="button" className="btn btn-dark loc-readmore" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
