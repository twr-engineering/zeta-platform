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
  /** `build`: the rule is captured in the matrix; the code still runs the interim until it is built. */
  blockedOn: 'capture' | 'live-check' | 'client' | 'build'
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
  'phone-page-detection': {
    need: 'Which page size phones actually receive on production, given WP Rocket serves one shared cache to phones and desktops.',
    refs: ['BPM-006a'],
    blockedOn: 'live-check',
    unblock: 'Fetch /search_results/ with a phone UA and a cache-busting query string, and count the results.',
    interim: 'Per request, as the source intends: Phone (isMobile && !isTablet) gets the module phone size, default 9.',
  },
  'listing-route-redirect': {
    need: 'What a listing served under the other view page does (/long-term/{sale-ref}/, /r/{rent-ref}/, or any ?query): the source 302s to the canonical link.',
    refs: ['BPM-007a'],
    blockedOn: 'live-check',
    unblock: 'Fetch a sale ref under /long-term/, a rent ref under /r/, and a ref with ?x=1 on production; record status codes and Location.',
    interim: 'Both routes serve any listing; no redirect.',
  },
  'keyword-case': {
    need: "Whether the CRM's reference lookup for a typed keyword is case-sensitive, and prefix or contains.",
    refs: ['BPM-016'],
    blockedOn: 'live-check',
    unblock: 'Search keyword_1=ztp73 and keyword_1=TP73 on production and compare with keyword_1=ZTP73.',
    interim: 'Case-insensitive contains on the reference number (identical to prefix for every ZTP reference).',
  },
  'account-registration': {
    need: 'What a first-time sign-up creates: the source skips the mail for an unknown email, and the CRM sync only runs from the mail path.',
    refs: ['BPM-014', 'FR-A04'],
    blockedOn: 'live-check',
    unblock: 'Register a new test email on production; check the CRM for a contact and the inbox for an access link.',
    interim: 'Not built.',
  },
  'recommendation-scope': {
    need: 'The "Please sign up to see your recommendation" step has no recommendation behind it: the survey answers are never submitted. Port it as-is, drop it, or specify a real recommendation.',
    refs: ['BPM-015', 'FR-A13'],
    blockedOn: 'client',
    unblock: 'Client decision.',
    interim: 'Not built.',
  },
  'account-area-build': {
    need: 'The account area (log in / sign up, liked properties, saved searches, subscriptions) as captured in BPM-014, with signed, expiring access links.',
    refs: ['BPM-014', 'FR-A04', 'FR-A10', 'FR-G07'],
    blockedOn: 'build',
    unblock: 'Build the account area (WP-07); the drawer links to /my-account/ meanwhile.',
    interim: 'The drawer shows "Log in / Sign up" pointing at /my-account/, which is not built.',
  },
  'global-search-modal': {
    need: 'FR-G08: the faceted search modal opened from the header on any page.',
    refs: ['FR-G08', 'FR-SR02'],
    blockedOn: 'build',
    unblock: 'Build the search filter panel (WP-04).',
    interim: 'The header search field is a free-text box (q, FR-SR14) that opens /search_results/; the faceted modal is not built.',
  },
  'payment-terms-filter': {
    need: 'Whether the CRM filters on payment_terms[] (More Filters → Payment Term), and against which field.',
    refs: ['BPM-021', 'FR-SR06'],
    blockedOn: 'live-check',
    unblock: 'Pick one Payment Term on production and compare the result count with none picked.',
    interim: 'The parameter is accepted and kept in the URL but does not filter.',
  },
  'type-tree-combination': {
    need: 'How the CRM combines sub_property_type[] with sub_sub_property_type[] when both are sent (e.g. House + Condominium › Studio).',
    refs: ['BPM-021', 'FR-SR02'],
    blockedOn: 'live-check',
    unblock: 'Select House and Studio together on production and compare counts with each alone.',
    interim: 'OR across the two lists (one property-type facet).',
  },
  'fa-collision': {
    need: 'Property View, Lot Type and Is Foreclosed all write fa[]: whether combining two selects sends both (AND) or only the last changed.',
    refs: ['BPM-021', 'BPM-004'],
    blockedOn: 'live-check',
    unblock: 'Pick Mountain, then Corner on production and record the URL and the CRM call.',
    interim: 'All selected attributes are sent and AND-ed (BPM-004).',
  },
  'location-counts': {
    need: 'City Guide listing counts (FR-H06) need each Location bound to its CRM geography ids (crmGeography), set during content migration.',
    refs: ['FR-H06', 'BPM-017'],
    blockedOn: 'build',
    unblock: 'Bind Locations to their CRM province/municipality/town ids (WP-10 content migration).',
    interim: 'Counts match listings by municipality name, which over-counts (e.g. every Cagayan de Oro listing, not just the city page\'s own).',
  },
  'location-defects': {
    need: 'Barangay pages show placeholder tabs ("test 4/5/Test6", CD-18), mislabelled tabs and a malformed Agri query (CD-19): reproduce, or use the city-page tab set on both levels?',
    refs: ['BPM-017', 'CD-18', 'CD-19'],
    blockedOn: 'client',
    unblock: 'Client decision (GP.5).',
    interim: 'Both levels use the city-page tab set with each tab filtering as its label says.',
  },
  'withdrawn-listing-url': {
    need: 'What a sold / leased / withdrawn listing URL does (404, 301, or empty shell).',
    refs: ['BPM-007', 'FR-P11', 'OQ-23'],
    blockedOn: 'client',
    unblock: 'Client supplies one sold reference number; fetch it on production.',
    interim: 'Withdrawn listings 404.',
  },
  'listing-field-render-set': {
    need: 'The listing detail page renders the captured field set: 45 rows in DOM order, with per-row conditions (BPM-020).',
    refs: ['BPM-020', 'FR-D01', 'FR-D04', 'FR-P01', 'FR-P02', 'FR-P10'],
    blockedOn: 'build',
    unblock: 'Build the listing page from BPM-020 with the design system (WP-03). Defect rows (CD-21..CD-27) need a GP.5 decision first.',
    interim: 'Detail page renders a minimal provisional field set; everything else is in crmPayload.',
  },
  'location-page-live-checks': {
    need: 'Location pages: which tab opens first, whether the UAG-hidden Bottom sections really hide, how the CRM combines city[] with municipality[], and the heading on the 20 pages without level meta.',
    refs: ['BPM-017', 'FR-L02', 'FR-L03'],
    blockedOn: 'live-check',
    unblock: 'Open one city page, one barangay page and one page without level meta on production.',
    interim: 'Not built.',
  },
  'article-double-h1': {
    need: 'Whether articles really render two H1s (the template title and the body\'s own first heading).',
    refs: ['BPM-018', 'FR-E04'],
    blockedOn: 'live-check',
    unblock: 'Open one article on production and count h1 elements.',
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
