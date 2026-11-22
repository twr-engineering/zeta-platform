/**
 * Content-Security-Policy (app PRD NFR-010): the app itself, the map tile host and nothing else.
 * Scripts carry a fresh per-request nonce (set by proxy.ts; Next applies it to its own scripts).
 * Styles allow 'unsafe-inline': React renders `style` attributes and Leaflet positions markers with
 * inline styles, which a nonce cannot cover. Fonts are self-hosted by next/font, so no font host.
 */
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** The origin of the tile URL template ("https://tile.openstreetmap.org"), or '' if it is not a URL. */
export function tileOrigin(template = process.env.NEXT_PUBLIC_TILE_URL || DEFAULT_TILE_URL): string {
  try {
    // Leaflet templates use {s}, {z}, {x}, {y}: replace them so URL() can parse the host.
    const u = new URL(template.replace(/\{s\}/g, 'a').replace(/\{[a-z]+\}/g, '0'))
    return template.includes('{s}') ? `${u.protocol}//*.${u.host.split('.').slice(1).join('.')}` : u.origin
  } catch {
    return ''
  }
}

export function buildCsp(opts: { nonce: string; dev: boolean; https: boolean; tile?: string }): string {
  const tile = opts.tile ?? tileOrigin()
  const parts = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${tile ? ' ' + tile : ''}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only over HTTPS: on plain-http localhost it would upgrade the app's own requests and break them.
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ]
  return parts.join('; ')
}

/** Fixed security headers for every response (NFR-004, NFR-010). */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Keeps a valid Referer for the OpenStreetMap tile servers, as their usage policy requires.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]
