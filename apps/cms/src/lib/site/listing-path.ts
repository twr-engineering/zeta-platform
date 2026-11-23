import type { Listing } from '@/payload-types'

/**
 * BPM-007 + BPM-007a — the listing URL is `/{view-page-slug}/{reference_no}/`, a frozen contract.
 *
 * The view page comes from `slugs.view[property_for_id . rent_period]` (respacio.php:286–316,
 * search-results.php:1788–1806). On the live site the suffix is always empty (no results module
 * sets `rent_period`), so the key is property_for_id alone, missing → '1' (:1670):
 *   1 Sale, 3 Rent and Sale            → /r/          (page 234194; no rent-to-buy page, falls back to sale)
 *   2 Rent, 4 Short rent, 5 Long rent  → /long-term/  (page 299846; no short/long pages, fall back to rent)
 *   6                                  → the view page of the request's property_for, if it has one
 * The listing's own rent_amount_period does NOT choose the page (it only fills a template token).
 */
const LONG_TERM = new Set(['2', '4', '5'])

export function listingPath(
  listing: Pick<Listing, 'referenceNo' | 'propertyForId'>,
  requestPropertyFor?: string | null,
): string {
  let key = listing.propertyForId || '1'
  if (key === '6' && requestPropertyFor) key = requestPropertyFor
  const view = LONG_TERM.has(key) ? 'long-term' : 'r'
  return `/${view}/${listing.referenceNo}/`
}
