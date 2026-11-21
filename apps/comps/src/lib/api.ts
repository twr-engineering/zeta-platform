import { NextResponse } from 'next/server'

import { STATUS, type ApiErrorCode } from './api-codes'

export type { ApiErrorCode }

/** `{ "error": { "code", "message"?, "field"? } }` with the code's status. */
export const apiError = (code: ApiErrorCode, message?: string, field?: string) =>
  NextResponse.json({ error: { code, ...(message ? { message } : {}), ...(field ? { field } : {}) } }, { status: STATUS[code] })

/**
 * CSRF on top of SameSite=Lax (§14): a write must come from this app's own origin. Browsers
 * always send Origin on POST/PUT/PATCH/DELETE fetches.
 */
export const sameOrigin = (req: Request): boolean => {
  const origin = req.headers.get('origin')
  if (!origin) return false
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Read a JSON body with exactly the allowed keys; anything else is bad_request (§14.1). */
export async function readBody<K extends string>(req: Request, keys: readonly K[]): Promise<Partial<Record<K, unknown>> | null> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (Object.keys(body).some((k) => !keys.includes(k as K))) return null
  return body as Partial<Record<K, unknown>>
}

/** A positive integer route id, or null (unknown ids answer 404). */
export const idParam = (s: string): number | null => (/^\d{1,12}$/.test(s) ? Number(s) : null)
