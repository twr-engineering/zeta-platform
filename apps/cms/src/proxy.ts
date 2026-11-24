import { NextResponse, type NextRequest } from 'next/server'

/**
 * BPM-007a (live check 2026-11-24): a listing URL with any query string — ?x=1, ?currency=USD, even
 * the device shim's ?res_dev= — answers 302 to the bare canonical path; nothing in the query is
 * applied first (no cookie is set). Only the listing view pages are matched.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl
  if (!url.search) return NextResponse.next()
  const target = url.clone()
  target.search = ''
  return NextResponse.redirect(target, 302)
}

export const config = { matcher: ['/r/:ref/', '/long-term/:ref/', '/r/:ref', '/long-term/:ref'] }
