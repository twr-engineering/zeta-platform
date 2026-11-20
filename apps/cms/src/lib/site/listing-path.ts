import { pending } from '@/lib/parity/pending'
import type { Listing } from '@/payload-types'

/**
 * BPM-007 — the listing URL is `/{view-page-slug}/{reference_no}/`. The reference number is the
 * identifier, and it is a frozen URL contract.
 */
export function listingPath(listing: Pick<Listing, 'referenceNo' | 'propertyForId' | 'rentAmountPeriod'>): string {
  pending('view-page-map')
  const view = listing.propertyForId === '2' && listing.rentAmountPeriod ? 'long-term' : 'r'
  return `/${view}/${listing.referenceNo}/`
}
