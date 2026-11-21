'use client'

import { create } from 'zustand'

import type { BootstrapJSON, DealJSON, LocationJSON, TypeJSON } from './data'

/**
 * The one client store for the browser tab (app PRD §5.1). M2 holds the bootstrap data
 * (§5.3, §14.5); later milestones add filters, selections and drafts here. A full reload
 * starts it again from defaults, as in the reference build.
 */
export type LoadStatus = 'loading' | 'error' | 'ready'

type DataState = {
  status: LoadStatus
  user: BootstrapJSON['user'] | null
  locations: LocationJSON[]
  types: TypeJSON[]
  deals: DealJSON[]
  /** First load, and "Try again": shows skeletons, then the data or the failure banner. */
  load: () => Promise<void>
  /** After a write (§14.5): refetch quietly, keeping what is shown until the answer comes. */
  refresh: () => Promise<void>
}

/** Session ended: go to login and come back here afterwards (AUTH-001). */
export function toLogin() {
  const next = window.location.pathname + window.location.search
  // A full navigation on purpose: logging in again starts a fresh store.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

async function fetchBootstrap(): Promise<BootstrapJSON> {
  const res = await fetch('/api/bootstrap', { cache: 'no-store', credentials: 'same-origin' })
  if (res.status === 401) {
    toLogin()
    throw new Error('unauthenticated')
  }
  if (!res.ok) throw new Error(`bootstrap ${res.status}`)
  return res.json()
}

export const useData = create<DataState>()((set, get) => ({
  status: 'loading',
  user: null,
  locations: [],
  types: [],
  deals: [],
  load: async () => {
    set({ status: 'loading' })
    try {
      set({ ...(await fetchBootstrap()), status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },
  refresh: async () => {
    try {
      set({ ...(await fetchBootstrap()), status: 'ready' })
    } catch {
      if (get().status !== 'ready') set({ status: 'error' })
    }
  },
}))

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message?: string; field?: string }

/** JSON call to the Comps API. 401 sends the user to login; network errors come back as status 0. */
export async function api<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, code: 'network' }
  }
  if (res.status === 401) toLogin()
  const json = res.status === 204 ? null : await res.json().catch(() => null)
  if (res.ok) return { ok: true, status: res.status, data: json as T }
  const err = (json as { error?: { code?: string; message?: string; field?: string } } | null)?.error
  return { ok: false, status: res.status, code: err?.code ?? 'server', message: err?.message, field: err?.field }
}
