'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, type ComponentProps } from 'react'

import { useData } from '@/lib/store'

/**
 * A frame link that respects the leave guard (app PRD §7.4.8): with unsaved edits, the screen
 * asks first and moves only on "Discard". New-tab clicks are left to the browser.
 */
export function GuardedLink(props: ComponentProps<typeof Link>) {
  const router = useRouter()
  return (
    <Link
      {...props}
      onClick={(e) => {
        props.onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        const g = useData.getState().leaveGuard
        if (!g) return
        e.preventDefault()
        g(() => router.push(String(props.href)))
      }}
    />
  )
}

/** Resolves true when it is fine to leave (no guard, or the user chose Discard). */
export function useGuard() {
  return useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        const g = useData.getState().leaveGuard
        if (!g) return resolve(true)
        g(() => resolve(true))
      }),
    [],
  )
}
