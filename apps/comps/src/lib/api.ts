import { NextResponse } from 'next/server'

/** Error codes and HTTP statuses of app PRD §14.1. */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  rate_limited: 429,
  server: 500,
}

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
