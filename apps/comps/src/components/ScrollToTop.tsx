'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { MAIN_VIEWS, useData, type MainView } from '@/lib/store'

/**
 * A route change to a different screen scrolls to the top (app PRD §5.2), and the last main
 * screen visited is remembered as the "go back" target of Add, Edit and Settings (§5.1).
 */
export function ScrollToTop() {
  const pathname = usePathname()
  const setLastView = useData((s) => s.setLastView)
  useEffect(() => {
    window.scrollTo(0, 0)
    if ((MAIN_VIEWS as readonly string[]).includes(pathname)) setLastView(pathname as MainView)
  }, [pathname, setLastView])
  return null
}
