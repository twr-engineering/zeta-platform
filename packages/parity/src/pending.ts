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
  'fa-collision': {
    need: 'Property View, Lot Type and Is Foreclosed all write fa[]: whether combining two selects sends both (AND) or only the last changed.',
    refs: ['BPM-021', 'BPM-004'],
    blockedOn: 'live-check',
    unblock: 'In a browser, pick Mountain, then Corner on production and record the URL. (CRM side checked 24 Nov 2026: fa[] values are AND-ed — Mountain 117, Corner 43, both 17.)',
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
  'listing-defects': {
    need: 'GP.5 decisions on the listing-page defects: no price on /long-term/ (CD-21), the literal "1 Parking" (CD-22), "House" for every type (CD-23), Beachfront missing from View (CD-24), Year Built from attribute ids (CD-25), the broken payment calculator (CD-26), share links fixed to ZTP116 (CD-27), Zeta Exclusive/Preselling ribbons (CD-28), Payment Term/Title Status reading the wrong field (CD-29).',
    refs: ['BPM-020', 'CD-21', 'CD-22', 'CD-23', 'CD-24', 'CD-25', 'CD-26', 'CD-27', 'CD-28', 'CD-29'],
    blockedOn: 'client',
    unblock: 'Client decision per defect: reproduce or fix.',
    interim: 'Fixed where reproducing would show wrong data (price on long-term, real parking/type/year/share URL/payment terms, a correct calculator); CD-24 and CD-28 are reproduced as captured.',
  },
  'withdrawn-listing-url': {
    need: 'What a sold / leased / withdrawn listing URL does (404, 301, or empty shell).',
    refs: ['BPM-007', 'FR-P11', 'OQ-23'],
    blockedOn: 'client',
    unblock: 'Client supplies one sold reference number; fetch it on production.',
    interim: 'Withdrawn listings 404.',
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
