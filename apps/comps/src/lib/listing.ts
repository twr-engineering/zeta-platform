/**
 * The Zeta website listing address format (app PRD §8.6.4), kept in one place because it may
 * change after the site migration. M4 adds linkLabel() (§8.8) here.
 */

/** A Zeta website listing link's code in upper case, or '' (`zetaCode()`). */
export function zetaCode(href: string | null | undefined): string {
  const m = /^https?:\/\/(?:www\.)?zetagroup\.ph\/r\/([A-Za-z0-9-]+)/i.exec(href ?? '')
  return m ? m[1].toUpperCase() : ''
}

/** The listing page for a code (`listingUrl()`). */
export const listingUrl = (code: string): string => `https://zetagroup.ph/r/${encodeURIComponent(code)}/`

const LINK_SITES: [RegExp, (u: URL) => string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, (u) => (/\/marketplace\//i.test(u.pathname) ? 'Facebook Marketplace' : /\/(videos|watch|reel)\b/i.test(u.pathname) ? 'Facebook video' : 'Facebook post')],
  [/(^|\.)fb\.me$|(^|\.)fb\.watch$/, (u) => (/fb\.watch$/.test(u.hostname) ? 'Facebook video' : 'Facebook post')],
  [/(^|\.)zetagroup\.ph$/, () => 'Zeta website'],
  [/(^|\.)lamudi\.com\.ph$/, () => 'Lamudi listing'],
  [/(^|\.)carousell\.(ph|com)$/, () => 'Carousell listing'],
  [/(^|\.)property24\.com\.ph$/, () => 'Property24 listing'],
  [/(^|\.)dotproperty\.com\.ph$/, () => 'Dot Property listing'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, () => 'YouTube video'],
  [/(^|\.)tiktok\.com$/, () => 'TikTok video'],
  [/(^|\.)instagram\.com$/, () => 'Instagram post'],
]

/** `linkLabel()` (§8.8): always describes the address that actually opens. */
export function linkLabel(href: string): string {
  const zc = zetaCode(href)
  if (zc) return `Zeta ${zc}`
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return 'Open link'
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, '')
  for (const [re, label] of LINK_SITES) if (re.test(host)) return label(u)
  return host
}

/** The address a deal's listing opens: its link, else the Zeta page for its code, else ''. */
export const listingHref = (d: { link: string | null; code: string | null }) => d.link || (d.code ? listingUrl(d.code) : '')
