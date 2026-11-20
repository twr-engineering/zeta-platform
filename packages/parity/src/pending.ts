/**
 * Pending-rule registry — the placeholders.
 *
 * Every behaviour the build needs but the Behavioural Parity Matrix has not yet captured
 * (or that is blocked on a client answer) is listed here ONCE, with what unblocks it.
 * Code that depends on such a rule calls `pending(id)` (or renders <Pending id=… />) at the
 * exact point the rule would apply, and uses the interim behaviour documented here.
 *
 * Why a registry rather than scattered TODOs: GP.2 forbids building P*-class logic from a
 * guess. An interim behaviour is still a guess, so each one must be findable, listed in
 * docs/PENDING.md, and replaced — not discovered in production. `pnpm pending` prints the
 * live list; when a rule is captured, delete its entry and the type checker shows every
 * call site that needs the real implementation.
 */

export type PendingRule = {
  /** What the build needs to know. */
  need: string
  /** PRD requirement / matrix row ids. */
  refs: string[]
  /** What unblocks it: a capture task, a live check, or a client answer. */
  blockedOn: 'capture' | 'live-check' | 'client'
  unblock: string
  /** What the code does in the meantime. Must be visibly provisional. */
  interim: string
}

export const PENDING = {
  'price-slider-plus': {
    need: 'What the price slider sends at its top "₱100,000,000+" stop.',
    refs: ['BPM-003', 'FR-SR05'],
    blockedOn: 'live-check',
    unblock: 'Exercise the live slider at its top stop and record the outbound request — note whether "+" is sent raw or as %2B.',
    interim:
      'Source path A: a max_* containing "+" is dropped (no ceiling). But $_GET decodes a raw "+" to a space, so only %2B reaches that branch; a raw "+" keeps the ceiling. Both reproduced.',
  },
  'band-max-zero': {
    need: 'Whether the CRM reads max_X=0 (sent after an open-ended "+" band) as "no ceiling" or literal zero.',
    refs: ['BPM-005'],
    blockedOn: 'live-check',
    unblock: 'Submit a banded facet with an open-ended top band on production and compare result counts.',
    interim: 'Treated as "no ceiling". The hull is still computed and transmitted exactly as the source does.',
  },
  'phone-page-size': {
    need: 'property_per_page_phone per listing module — server-side Mobile_Detect changes page size on phones.',
    refs: ['BPM-006'],
    blockedOn: 'capture',
    unblock: 'Census property_per_page_phone across respacio-blocks/search-results block attributes.',
    interim: 'Desktop page size everywhere.',
  },
  'view-page-map': {
    need: 'The prop_options slugs.view map: which view page (/r/ or /long-term/) each property_for_id + rent_amount_period resolves to.',
    refs: ['BPM-007'],
    blockedOn: 'capture',
    unblock: 'Unserialize the respacio options row in wp_options and read slugs.view.',
    interim: 'Rent + a rent period -> /long-term/{ref}/, everything else -> /r/{ref}/. Both routes serve any listing.',
  },
  'withdrawn-listing-url': {
    need: 'What a sold / leased / withdrawn listing URL does (404, 301, or empty shell).',
    refs: ['BPM-007', 'FR-P11', 'OQ-23'],
    blockedOn: 'client',
    unblock: 'Client supplies one sold reference number; fetch it on production.',
    interim: 'Withdrawn listings 404.',
  },
  'listing-field-render-set': {
    need: 'Which of the 113 detail fields + 24 collections the listing template renders, in what order.',
    refs: ['FR-D01', 'FR-D04', 'FR-P01', 'FR-P02', 'FR-P10'],
    blockedOn: 'capture',
    unblock: 'Transcribe the properties/view template DSL records into matrix rows.',
    interim: 'Detail page renders a minimal provisional field set; everything else is in crmPayload.',
  },
  'location-templates': {
    need: 'Module set, order and data source for city vs barangay location templates.',
    refs: ['FR-L02', 'FR-L03'],
    blockedOn: 'capture',
    unblock: 'Read templates/customtemplates records and respacio_location_tree postmeta.',
    interim: 'Location pages render intro + listings bound by crmGeography + content.',
  },
  'account-area': {
    need: 'Whether e-mail verification is enforced; the account-area feature set.',
    refs: ['FR-A04', 'FR-A10'],
    blockedOn: 'capture',
    unblock: 'Read functions.php:823–920, the my-account page body and contacts/* calls.',
    interim: 'Not built.',
  },
  'recommendation-gate': {
    need: 'The rule behind "Please sign up to see your recommendation".',
    refs: ['FR-A13'],
    blockedOn: 'capture',
    unblock: 'Read functions.php, contacts/check_contact and the my-account page.',
    interim: 'Not built.',
  },
  'contact-forms': {
    need: 'Field names, order, labels, validation, consent wording and routing for the live forms.',
    refs: ['FR-F02', 'FR-F03', 'FR-F04', 'FR-F06', 'OQ-17'],
    blockedOn: 'client',
    unblock: 'Client confirms which of the 89 wpcf7_contact_form records are live.',
    interim: 'Inquiry slots render a placeholder; no submissions are accepted.',
  },
  'gated-downloads': {
    need: 'Whether the logged-out login-gate on /buy/ downloads is intended or an inverted condition.',
    refs: ['CD-08'],
    blockedOn: 'client',
    unblock: 'Client supplies a login; compare /buy/ logged in vs logged out.',
    interim: 'Download buttons render a placeholder.',
  },
  'article-template': {
    need: 'Article template field set and the block census across post bodies.',
    refs: ['FR-E04', 'FR-E05'],
    blockedOn: 'capture',
    unblock: 'Census wp_posts of type post.',
    interim: 'Not built.',
  },
  'directory-filters': {
    need: 'Directory filter semantics.',
    refs: ['FR-E20'],
    blockedOn: 'capture',
    unblock: 'Read includes/cpt-directory.php and respacio-blocks/infinity-directory-grid.',
    interim: 'Not built.',
  },
  'shortlist-count': {
    need: 'What [respacio_shortlist_count] should count — it was never implemented.',
    refs: ['BPM-009', 'CD-01'],
    blockedOn: 'client',
    unblock: 'Client confirms the obvious rule: the result count of the shortlist saved query.',
    interim: 'Count is not rendered.',
  },
  'beachfront-query': {
    need: 'The correct sub-type for the Beachfront shortlist.',
    refs: ['CD-13', 'OQ-22'],
    blockedOn: 'client',
    unblock:
      'CRM payloads show _st_7 = "Commercial", so Commercial is right and Beachfront is the broken clone. Attribute 145 = "Beachfront" exists — ask the client: should Beachfront be fa[]=a145? (matrix S3-2)',
    interim: 'Migrated as-is (byte-identical to Commercial).',
  },
  'amount-filter': {
    need: 'Whether ?amount= from the calculator actually filters search results, and how.',
    refs: ['BPM-001'],
    blockedOn: 'live-check',
    unblock: 'Retest the A/B with JS enabled on both variants (CD-15 confounded the first run).',
    interim: 'The parameter is accepted and preserved in the URL but does not filter.',
  },
  'price-display-live': {
    need: 'The exact rendered price string — format_price depends on the server ICU version and get_locale().',
    refs: ['BPM-008', 'CD-03'],
    blockedOn: 'live-check',
    unblock: 'Copy three rendered prices (PHP listing, PHP listing in USD, EUR listing) from production.',
    interim: 'en-US ICU with the code->symbol substitution, e.g. "₱ 8,000,000".',
  },
  'sort-field-semantics': {
    need: 'Which listing timestamp `date` sorts on, and how `priorityprice` orders ties.',
    refs: ['BPM-002'],
    blockedOn: 'live-check',
    unblock: 'Compare a date_desc and a priorityprice_desc result page on production against the CRM fields.',
    interim: 'date -> crmModifiedAt; priorityprice -> priority desc, then price in the given direction.',
  },
  'area-facet-combination': {
    need: 'Whether municipality_* and city_* values inside one area[] selection are OR-ed (as one facet) or AND-ed.',
    refs: ['BPM-004'],
    blockedOn: 'live-check',
    unblock: 'Select one municipality and one city in the same search on production and compare counts.',
    interim: 'OR within the area facet, like every other indexed facet.',
  },
  'keyword-search': {
    need: 'The auto-suggest keyword path (filter_auto_suggest_direct -> reference_no[]).',
    refs: ['FR-SR14'],
    blockedOn: 'capture',
    unblock: 'Read filter_auto_suggest_direct and the fields_custom keyword session config.',
    interim: 'keyword= matches referenceNo exactly, else title contains.',
  },
  'respacio-credentials': {
    need: 'Live Respacio API access for the sync.',
    refs: ['DG-01', 'DG-05', 'R-19'],
    blockedOn: 'client',
    unblock: 'Client/Respacio issue an API key; set RESPACIO_API_KEY (a network secret in cloud sessions).',
    interim: 'The sync runs against the committed golden-master fixtures (RESPACIO_MODE=fixtures).',
  },
} as const satisfies Record<string, PendingRule>

export type PendingId = keyof typeof PENDING

const warned = new Set<PendingId>()

/**
 * Mark the point where a pending rule applies. Returns the rule so callers can read its
 * interim behaviour; logs once per process so provisional paths are never silent.
 */
export function pending(id: PendingId): PendingRule {
  if (!warned.has(id) && process.env.NODE_ENV !== 'test') {
    warned.add(id)
    console.warn(`[parity:pending] ${id} — ${PENDING[id].interim}`)
  }
  return PENDING[id]
}
