'use client'

import Link from 'next/link'

/** BPM-020 row 11: the sub-nav's "Back" is window.history.back() (search results when there is no history). */
export function BackLink() {
  return (
    <Link
      href="/search_results/?property_for=1"
      className="lp-back"
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault()
          window.history.back()
        }
      }}
    >
      ← Back
    </Link>
  )
}
