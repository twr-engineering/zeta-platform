# Pending rules

Generated from `packages/parity/src/pending.ts` by `pnpm pending --md`. Do not edit by hand.

Each entry is a placeholder: the code runs an interim behaviour at the marked point and logs
`[parity:pending]` once. When a rule is captured and signed in the matrix, implement it, delete
the entry, and let the type checker show the remaining call sites.

## Waiting on the client (7)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|
| `recommendation-scope` | BPM-015, FR-A13 | The "Please sign up to see your recommendation" step has no recommendation behind it: the survey answers are never submitted. Port it as-is, drop it, or specify a real recommendation. | Client decision. | Not built. |
| `withdrawn-listing-url` | BPM-007, FR-P11, OQ-23 | What a sold / leased / withdrawn listing URL does (404, 301, or empty shell). | Client supplies one sold reference number; fetch it on production. | Withdrawn listings 404. |
| `contact-forms` | FR-F02, FR-F03, FR-F04, FR-F06, OQ-17 | Field names, order, labels, validation, consent wording and routing for the live forms. | Client confirms which of the 89 wpcf7_contact_form records are live. | Inquiry slots render a placeholder; no submissions are accepted. |
| `gated-downloads` | CD-08 | Whether the logged-out login-gate on /buy/ downloads is intended or an inverted condition. | Client supplies a login; compare /buy/ logged in vs logged out. | Download buttons render a placeholder. |
| `shortlist-count` | BPM-009, CD-01 | What [respacio_shortlist_count] should count — it was never implemented. | Client confirms the obvious rule: the result count of the shortlist saved query. | Count is not rendered. |
| `beachfront-query` | CD-13, OQ-22 | The correct sub-type for the Beachfront shortlist. | CRM payloads show _st_7 = "Commercial", so Commercial is right and Beachfront is the broken clone. Attribute 145 = "Beachfront" exists — ask the client: should Beachfront be fa[]=a145? (matrix S3-2) | Migrated as-is (byte-identical to Commercial). |
| `respacio-credentials` | DG-01, DG-05, R-19 | Live Respacio API access for the sync. | Client/Respacio issue an API key; set RESPACIO_API_KEY (a network secret in cloud sessions). | The sync runs against the committed golden-master fixtures (RESPACIO_MODE=fixtures). |

## Needs a check against production (12)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|
| `price-slider-plus` | BPM-003, FR-SR05 | What the price slider sends at its top "₱100,000,000+" stop. | Exercise the live slider at its top stop and record the outbound request — note whether "+" is sent raw or as %2B. | Source path A: a max_* containing "+" is dropped (no ceiling). But $_GET decodes a raw "+" to a space, so only %2B reaches that branch; a raw "+" keeps the ceiling. Both reproduced. |
| `band-max-zero` | BPM-005 | Whether the CRM reads max_X=0 (sent after an open-ended "+" band) as "no ceiling" or literal zero. | Submit a banded facet with an open-ended top band on production and compare result counts. | Treated as "no ceiling". The hull is still computed and transmitted exactly as the source does. |
| `phone-page-detection` | BPM-006a | Which page size phones actually receive on production, given WP Rocket serves one shared cache to phones and desktops. | Fetch /search_results/ with a phone UA and a cache-busting query string, and count the results. | Per request, as the source intends: Phone (isMobile && !isTablet) gets the module phone size, default 9. |
| `listing-route-redirect` | BPM-007a | What a listing served under the other view page does (/long-term/{sale-ref}/, /r/{rent-ref}/, or any ?query): the source 302s to the canonical link. | Fetch a sale ref under /long-term/, a rent ref under /r/, and a ref with ?x=1 on production; record status codes and Location. | Both routes serve any listing; no redirect. |
| `keyword-case` | BPM-016 | Whether the CRM's reference lookup for a typed keyword is case-sensitive, and prefix or contains. | Search keyword_1=ztp73 and keyword_1=TP73 on production and compare with keyword_1=ZTP73. | Case-insensitive contains on the reference number (identical to prefix for every ZTP reference). |
| `account-registration` | BPM-014, FR-A04 | What a first-time sign-up creates: the source skips the mail for an unknown email, and the CRM sync only runs from the mail path. | Register a new test email on production; check the CRM for a contact and the inbox for an access link. | Not built. |
| `location-page-live-checks` | BPM-017, FR-L02, FR-L03 | Location pages: which tab opens first, whether the UAG-hidden Bottom sections really hide, how the CRM combines city[] with municipality[], and the heading on the 20 pages without level meta. | Open one city page, one barangay page and one page without level meta on production. | Not built. |
| `article-double-h1` | BPM-018, FR-E04 | Whether articles really render two H1s (the template title and the body's own first heading). | Open one article on production and count h1 elements. | Not built. |
| `amount-filter` | BPM-001 | Whether ?amount= from the calculator actually filters search results, and how. | Retest the A/B with JS enabled on both variants (CD-15 confounded the first run). | The parameter is accepted and preserved in the URL but does not filter. |
| `price-display-live` | BPM-008, CD-03 | The exact rendered price string — format_price depends on the server ICU version and get_locale(). | Copy three rendered prices (PHP listing, PHP listing in USD, EUR listing) from production. | en-US ICU with the code->symbol substitution, e.g. "₱ 8,000,000". |
| `sort-field-semantics` | BPM-002 | Which listing timestamp `date` sorts on, and how `priorityprice` orders ties. | Compare a date_desc and a priorityprice_desc result page on production against the CRM fields. | date -> crmModifiedAt; priorityprice -> priority desc, then price in the given direction. |
| `area-facet-combination` | BPM-004 | Whether municipality_* and city_* values inside one area[] selection are OR-ed (as one facet) or AND-ed. | Select one municipality and one city in the same search on production and compare counts. | OR within the area facet, like every other indexed facet. |

## Readable from the local artefacts (capture work) (0)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|

## Captured, not built yet (3)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|
| `account-area-build` | BPM-014, FR-A04, FR-A10, FR-G07 | The account area (log in / sign up, liked properties, saved searches, subscriptions) as captured in BPM-014, with signed, expiring access links. | Build the account area (WP-07); the drawer links to /my-account/ meanwhile. | The drawer shows "Log in / Sign up" pointing at /my-account/, which is not built. |
| `global-search-modal` | FR-G08, FR-SR02 | FR-G08: the faceted search modal opened from the header on any page. | Build the search filter panel (WP-04). | The header search field links to /search_results/?property_for=1 (Sale). |
| `listing-field-render-set` | BPM-020, FR-D01, FR-D04, FR-P01, FR-P02, FR-P10 | The listing detail page renders the captured field set: 45 rows in DOM order, with per-row conditions (BPM-020). | Build the listing page from BPM-020 with the design system (WP-03). Defect rows (CD-21..CD-27) need a GP.5 decision first. | Detail page renders a minimal provisional field set; everything else is in crmPayload. |
