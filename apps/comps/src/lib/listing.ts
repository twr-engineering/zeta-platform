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
