'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/** A route change to a different screen scrolls to the top (app PRD §5.2). */
export function ScrollToTop() {
  const pathname = usePathname()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
