'use client'

import { useData } from '@/lib/store'

export const LOAD_FAILED = 'The closed deals could not be loaded. Check your connection and try again.'

/** The shared load-failure banner (§5.3, A.12), with "Try again" repeating the request. */
export function LoadError() {
  const load = useData((s) => s.load)
  return (
    <div className="err loaderr" role="alert">
      {LOAD_FAILED}{' '}
      <button type="button" className="link bad" onClick={() => void load()}>
        Try again
      </button>
    </div>
  )
}

/** A table skeleton (§10.6.21): `rows` blocks in --surface-2. */
export function TableSkeleton({ rows = 6, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="skelrows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel" style={{ height }} />
      ))}
    </div>
  )
}

/**
 * The bootstrap gate for a screen whose real content arrives in a later milestone: nothing
 * while loading, the banner on failure. Screens with content handle all three states.
 */
export function LoadGate() {
  const status = useData((s) => s.status)
  return status === 'error' ? <LoadError /> : null
}
