# Pending rules

Generated from `packages/parity/src/pending.ts` by `pnpm pending --md`. Do not edit by hand.

Each entry is a placeholder: the code runs an interim behaviour at the marked point and logs
`[parity:pending]` once. When a rule is captured and signed in the matrix, implement it, delete
the entry, and let the type checker show the remaining call sites.

## Waiting on the client (6)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|
| `withdrawn-listing-url` | BPM-007, FR-P11, OQ-23 | What a sold / leased / withdrawn listing URL does (404, 301, or empty shell). | Client supplies one sold reference number; fetch it on production. | Withdrawn listings 404. |
| `contact-forms` | FR-F02, FR-F03, FR-F04, FR-F06, OQ-17 | Field names, order, labels, validation, consent wording and routing for the live forms. | Client confirms which of the 89 wpcf7_contact_form records are live. | Inquiry slots render a placeholder; no submissions are accepted. |
| `gated-downloads` | CD-08 | Whether the logged-out login-gate on /buy/ downloads is intended or an inverted condition. | Client supplies a login; compare /buy/ logged in vs logged out. | Download buttons render a placeholder. |
| `shortlist-count` | BPM-009, CD-01 | What [respacio_shortlist_count] should count — it was never implemented. | Client confirms the obvious rule: the result count of the shortlist saved query. | Count is not rendered. |
| `beachfront-query` | CD-13, OQ-22 | The correct sub-type for the Beachfront shortlist. | CRM payloads show _st_7 = "Commercial", so Commercial is right and Beachfront is the broken clone. Attribute 145 = "Beachfront" exists — ask the client: should Beachfront be fa[]=a145? (matrix S3-2) | Migrated as-is (byte-identical to Commercial). |
| `respacio-credentials` | DG-01, DG-05, R-19 | Live Respacio API access for the sync. | Client/Respacio issue an API key; set RESPACIO_API_KEY (a network secret in cloud sessions). | The sync runs against the committed golden-master fixtures (RESPACIO_MODE=fixtures). |

## Needs a check against production (6)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|
| `price-slider-plus` | BPM-003, FR-SR05 | What the price slider sends at its top "₱100,000,000+" stop. | Exercise the live slider at its top stop and record the outbound request — note whether "+" is sent raw or as %2B. | Source path A: a max_* containing "+" is dropped (no ceiling). But $_GET decodes a raw "+" to a space, so only %2B reaches that branch; a raw "+" keeps the ceiling. Both reproduced. |
| `band-max-zero` | BPM-005 | Whether the CRM reads max_X=0 (sent after an open-ended "+" band) as "no ceiling" or literal zero. | Submit a banded facet with an open-ended top band on production and compare result counts. | Treated as "no ceiling". The hull is still computed and transmitted exactly as the source does. |
| `amount-filter` | BPM-001 | Whether ?amount= from the calculator actually filters search results, and how. | Retest the A/B with JS enabled on both variants (CD-15 confounded the first run). | The parameter is accepted and preserved in the URL but does not filter. |
| `price-display-live` | BPM-008, CD-03 | The exact rendered price string — format_price depends on the server ICU version and get_locale(). | Copy three rendered prices (PHP listing, PHP listing in USD, EUR listing) from production. | en-US ICU with the code->symbol substitution, e.g. "₱ 8,000,000". |
| `sort-field-semantics` | BPM-002 | Which listing timestamp `date` sorts on, and how `priorityprice` orders ties. | Compare a date_desc and a priorityprice_desc result page on production against the CRM fields. | date -> crmModifiedAt; priorityprice -> priority desc, then price in the given direction. |
| `area-facet-combination` | BPM-004 | Whether municipality_* and city_* values inside one area[] selection are OR-ed (as one facet) or AND-ed. | Select one municipality and one city in the same search on production and compare counts. | OR within the area facet, like every other indexed facet. |

## Readable from the local artefacts (capture work) (9)

| Id | Refs | Needed | Unblocks when | Interim |
|---|---|---|---|---|
| `phone-page-size` | BPM-006 | property_per_page_phone per listing module — server-side Mobile_Detect changes page size on phones. | Census property_per_page_phone across respacio-blocks/search-results block attributes. | Desktop page size everywhere. |
| `view-page-map` | BPM-007 | The prop_options slugs.view map: which view page (/r/ or /long-term/) each property_for_id + rent_amount_period resolves to. | Unserialize the respacio options row in wp_options and read slugs.view. | Rent + a rent period -> /long-term/{ref}/, everything else -> /r/{ref}/. Both routes serve any listing. |
| `listing-field-render-set` | FR-D01, FR-D04, FR-P01, FR-P02, FR-P10 | Which of the 113 detail fields + 24 collections the listing template renders, in what order. | Transcribe the properties/view template DSL records into matrix rows. | Detail page renders a minimal provisional field set; everything else is in crmPayload. |
| `location-templates` | FR-L02, FR-L03 | Module set, order and data source for city vs barangay location templates. | Read templates/customtemplates records and respacio_location_tree postmeta. | Location pages render intro + listings bound by crmGeography + content. |
| `account-area` | FR-A04, FR-A10 | Whether e-mail verification is enforced; the account-area feature set. | Read functions.php:823–920, the my-account page body and contacts/* calls. | Not built. |
| `recommendation-gate` | FR-A13 | The rule behind "Please sign up to see your recommendation". | Read functions.php, contacts/check_contact and the my-account page. | Not built. |
| `article-template` | FR-E04, FR-E05 | Article template field set and the block census across post bodies. | Census wp_posts of type post. | Not built. |
| `directory-filters` | FR-E20 | Directory filter semantics. | Read includes/cpt-directory.php and respacio-blocks/infinity-directory-grid. | Not built. |
| `keyword-search` | FR-SR14 | The auto-suggest keyword path (filter_auto_suggest_direct -> reference_no[]). | Read filter_auto_suggest_direct and the fields_custom keyword session config. | keyword= matches referenceNo exactly, else title contains. |
