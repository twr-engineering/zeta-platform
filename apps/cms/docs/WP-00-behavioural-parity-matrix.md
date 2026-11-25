# WP-00 — Behavioural Parity Matrix

| Field | Value |
|---|---|
| **Document** | Behavioural Parity Matrix (PRD Appendix G, produced in full) |
| **Project** | Zeta Group Property Portal — replatform to Payload CMS 3 + Next.js |
| **Governs** | PRD v2.1 §GP.2, GP.3, GP.4 (FR-PY01, FR-PY02, FR-PY08) |
| **Date** | 22 August 2026 |
| **Status** | **Session 4 — local capture complete (23 Nov 2026).** 21 rules captured (BPM-001 verified against production); 1 outstanding (forms, blocked on OQ-17); 18 defects live. See §4 |
| **Sources** | `_db/cwddmsp86-20260822-021406.sql.gz` and `site/`. Every row cites file:line or table+row per FR-PY08 |

> **No build ticket for a P\* requirement may be opened until its row here is complete and signed** (FR-PY02). A row marked *Extracted* is safe to build against once signed. A row marked *Needs live confirmation* must be checked against zetagroup.ph first.


> **Canonical copy.** As of 29 Oct 2026 this file lives in the `zeta-payload` repo (`docs/`) so cloud
> sessions and collaborators can read it. The copy in `zeta-group/` is the 22 Aug snapshot. Placeholders
> for every uncaptured rule are in `src/lib/parity/pending.ts`; run `pnpm pending` for the live list.

---

## 1. Confidence legend

| Mark | Meaning |
|---|---|
| **Extracted** | Rule read directly from unminified source. Highest confidence |
| **Extracted + corroborated** | Read from source *and* confirmed against the cached CRM request corpus (`wp_curl_info`, 1,554 real calls) |
| **Needs live confirmation** | Source is clear but runtime behaviour depends on caching, plugin interaction or CRM-side logic we cannot see |
| **Asserted** | Client statement only. None yet |

---

## 2. Captured rules

### BPM-001 · FR-T01 · Home loan calculator

| | |
|---|---|
| **Class** | P (was P\*) |
| **Source** | `wp_posts` ID **293904** (`customtemplates`, `custom-home-loan-template`) — markup; `wp_postmeta` `post_id=293904, meta_key='javascript'` — logic |
| **Confidence** | **Extracted + VERIFIED AGAINST PRODUCTION** — the strongest evidence class in this document |

**Live verification, 22 Aug 2026.** Inputs `income=100000, years=20, rate=7` on `https://zetagroup.ph/buy/`:

| | Value |
|---|---|
| Live site rendered | **₱3,869,475.19** |
| Predicted offline from the formula below | **₱3,869,475.19** |
| Delta | **0.00** |

Exact to the centavo. The redirect was exercised and landed on `/search_results/?amount=3869475.19`, confirming the URL contract. **This row is golden-master vector `GM-CALC-001` and is safe to build against.**

```
maxMonthlyPayment   = grossMonthlyIncome × 0.30      ← hard-coded affordability constant
monthlyInterestRate = (annualRate ÷ 100) ÷ 12         ← nominal, NOT effective compounding
totalPayments       = years × 12
principalLoanAmount = (maxMonthlyPayment ÷ monthlyInterestRate)
                      × (1 − (1 + monthlyInterestRate)^(−totalPayments))
```

- **No rounding during computation.** Formatted once for display: `toLocaleString('en-US', {style:'currency', currency:'PHP'})` → grouped thousands, exactly 2 decimals, `₱` prefix.
- Outputs **one** figure only — maximum loanable amount. No monthly amortisation, no affordability ceiling, no down-payment assumption.
- Redirect: `/search_results/?amount={principalLoanAmount.toFixed(2)}` — **unrounded value, then `toFixed(2)`**. The `amount` parameter is a frozen URL contract.
- Term options: 5/10/15/20/25/30, default **5**. Validation: income + rate required; **term unvalidated**; rate `0` → `Infinity`; non-numeric → `NaN`.

**Sign-off:** ☐ *(unblocked — CD-07 withdrawn, see §3)*

---

### BPM-002 · FR-SR01 · Default result ordering

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | `templates/search-results.php:66–71`, `:709–718`, `:846–853`; corroborated against 1,381 cached `properties` calls |
| **Confidence** | **Extracted + corroborated** |

Resolution order for sort:

1. `$_GET['sortby']` if present, else
2. `$args['sortby']` (the block/template configuration), else
3. **`price_desc`** — the hard-coded fallback at `:67`

The wire format is `order_by` + `order`, derived by `explode("_", $sortby)`. All seven legal values split cleanly on one underscore: `date_asc`, `date_desc`, `price_asc`, `price_desc`, `priority_desc`, `priorityprice_asc`, `priorityprice_desc`.

**What actually ships.** Across the cached corpus the fallback is never reached — the block config always supplies a value:

| `order_by` / `order` sent | Calls |
|---|---|
| `priority` / `desc` | 636 |
| `date` / `desc` | 151 |
| `modified_date` / `desc` | 25 |
| `price` / `asc` | 15 |
| **`price` / `desc`** | **0** |

**Build note.** Reproducing only the documented fallback would give every unconfigured listing module *price descending* where production gives *priority descending*. **The operative default is `priority desc`**; `price_desc` is a fallback that production never exercises. Both must be reproduced, in that precedence.

**Sign-off:** ☐

---

### BPM-003 · FR-SR05 · Price filter bounds and the "₱100,000,000+" stop

| | |
|---|---|
| **Class** | P\* → resolved, one part needs live confirmation |
| **Source** | `templates/search-results.php:585–598`, `:603–643`; cached corpus |
| **Confidence** | **Extracted + corroborated** (ceiling: **needs live confirmation**, single observation) |

Two distinct code paths, and they behave differently:

**Path A — direct `min_price` / `max_price` parameters** (`:585–598`):
- `min_price`, `min_bedroom`, `min_bathroom` → sanitised with `preg_replace('/[^A-Za-z0-9\. -]/','')` and passed through.
- `max_price`, `max_bedroom`, `max_bathroom` → **if the value contains `+`, the parameter is silently dropped** — the `else` branch at `:590–594` is empty. A `+` upper bound therefore sends **no ceiling at all**.

**Path B — banded `price` facet** (`:603–643`): see BPM-004.

**The ₱100,000,000 stop — CORRECTED, see BPM-012.** An earlier draft of this row claimed the corpus contained a user search sending `max_price=100000000`, and inferred that the slider's "+" stop is a hard ceiling. **That inference was wrong.** The request in question is not a user search at all — it is the hard-coded **Luxury Houses shortlist** query (`min_price=19901000&max_price=100000000`), captured independently at BPM-012. It tells us what an editor typed into a block attribute, and nothing whatsoever about the slider.

> ⚠ **The slider's `+` behaviour remains UNCAPTURED.** The corpus contains no user-originated price-slider search. Path A (`:590–594`) says a `+` value is dropped, which would mean *no ceiling*; nothing corroborates that. **Do not build the price slider from this row.** Exercise the live slider at its top stop and record the outbound request.

This was caught only because BPM-012 was captured afterwards and the two queries matched exactly. It is a good argument for corroborating every corpus-derived rule against a second source before signing it.

**Currency.** `min_price`/`max_price` are sent as raw integers. `displaycurrency` appears on only 42 of 1,381 calls, and 40 of those are the similar-properties widget (BPM-010), which **hard-codes `displaycurrency="EUR"` at `:356` while sending peso-denominated bounds**. Conversion is a *display-layer* concern (BPM-008), not a filter-layer one — the bound is sent in the stored currency.

**Sign-off:** ☐

---

### BPM-004 · FR-SR02/SR03 · How multi-select facets combine

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | Cached corpus parameter census; `templates/search-results.php:644–651` |
| **Confidence** | **Extracted + corroborated** |

**Within a facet** — indexed array parameters, i.e. a set membership test (OR):

`area[0]`, `area[1]` · `type[0..2]` · `sub_property_type[0..2]` · `city[0]` · `municipality[0]` · `sale_detail_type[0]` · `reference_no[0]`

**Across facets** — parameters are combined conjunctively (AND).

**Attributes and features** carry an explicit switch: **`use_and_operator_for_attr_fet=1`**, present on **1,355 of 1,381** calls. Amenity/feature selections are therefore **AND**, not OR — a listing must have *all* selected features.

Standing companion parameters, effectively constants in production:

| Parameter | Value | Calls |
|---|---|---|
| `use_and_operator_for_attr_fet` | `1` | 1,355 |
| `required_all_images` | `0` | 1,355 |
| `remove_attributes` | `1` | 1,355 |
| `is_required_marketing_feature` | — | 1,355 |
| `get_property_form_data` | — | 1,355 |
| `add_attribute_feature` | — | 1,381 |
| `language` | `en` | 1,381 |

**Build note.** GP.6 names filter combination as the first place parity breaks. Flipping `use_and_operator_for_attr_fet` to OR silently changes every faceted result set on the site.

**Sign-off:** ☐

---

### BPM-005 · FR-SR05 · Multi-band range facets collapse to a hull

| | |
|---|---|
| **Class** | P\* → resolved. **Highest-surprise rule in this document** |
| **Source** | `templates/search-results.php:603–643` |
| **Confidence** | **Extracted** |

Applies to `price`, `bedroom`, `bathroom`, `plot_size`, `total_built_size` when the UI offers selectable bands.

Selecting multiple bands does **not** produce a union. The code walks every selected band, tracking `minh` = the **lowest lower bound seen** and `maxh` = the **highest upper bound seen**, then emits a **single** `min_X` / `max_X` pair.

> Selecting **₱1M–2M** *and* **₱10M–20M** returns **everything from ₱1M to ₱20M** — including the ₱5M properties the user did not ask for.

Additional details:
- A band whose lower bound ends in `>` or `+` sets `maxh = 0` (`:616–622`).
- A band whose upper bound ends in `+` sets `maxh = 0` (`:623–627`).
- `if ($minh == -1) $minh = 0;` — **`min_X=0` is always sent**, even when the user set no lower bound.
- `max_X` is emitted whenever `$maxh != ""`. Under PHP 8 comparison semantics `0 != ""` is **true**, so `max_X=0` *is* transmitted after a `+` band. Whether the CRM reads `0` as "no ceiling" or as a literal zero is **CRM-side and unverifiable from here**.

> ⚠ **Needs live confirmation** on the `max_X=0` question specifically. It decides whether an open-ended band returns everything or nothing.

**Sign-off:** ☐

---

### BPM-006 · FR-SR (pagination) · Results per page

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | `templates/search-results.php:730–739`, `:870–875` |
| **Confidence** | **Extracted + corroborated** |

Resolution order:

1. `$args['property_per_page_phone']` **if the device is detected as Phone** — device-aware, server-side, via `Mobile_Detect.php`
2. `$args['property_per_page']`
3. `get_option('posts_per_page')` → **9**
4. `$_GET['property_per_page']` **overrides all of the above** unless `$args['layout'] === 'card_only'`

Also sent: `property_offset`, and `page_id` from `$_REQUEST['pageid']` (default `1`).

Observed values in the corpus: `4`, `12`, `50` (keyword auto-suggest, `:564`).

**Build notes.**
- Server-side device detection changing page size is a **logic** difference between phone and desktop, not a responsive-styling one. It is frozen, and it interacts badly with CDN caching — reproduce the behaviour, but review the cache-key implications (this is an R-class concern, not a licence to change the counts).
- `$_GET['property_per_page']` is unbounded and unsanitised. Reproduce the parameter; **bound it** in the new build and record that as a deviation if the ceiling is user-visible.

**Sign-off:** ☐

---

### BPM-007 · FR-P11 · Listing detail URL form

| | |
|---|---|
| **Class** | P\* → partially resolved |
| **Source** | `templates/search-results.php:1426–1433`, `:1465–1472`, `:1788–1806` |
| **Confidence** | **Extracted**; lifecycle behaviour **needs live confirmation** |

```php
$property_details_page_id = $prop_options['slugs']['view'][$property_for_id . $data['rent_amount_period']];
// fallback: $prop_options['slugs']['view'][$data['property_for']]
$property_view_link = get_page_link($property_details_page_id) . $prop_ref . '/';
```

The URL is **`/{view-page-slug}/{reference_no}/`** — e.g. `/r/ZTP345/`. The reference number, not a slug, is the identifier.

The view page is selected by `property_for_id` concatenated with `rent_amount_period`, which is why the site has **two** view pages: `/r/` (Property View) and `/long-term/` (LONG RENTAL PROPERTY VIEW). Sale and long-term rental resolve to different templates.

**Still open:** what happens to the URL of a **sold, leased or withdrawn** listing. The CRM simply stops returning the record; whether the page 404s, 301s or renders an empty shell is a runtime behaviour we cannot read from source.

> ⚠ **Needs live confirmation.** Ask the client for one sold reference number and fetch it. This is the whole of FR-P11 and it is a redirect-map input.

**Sign-off:** ☐

---

### BPM-008 · FR-G03 / FR-G04 / FR-G06 · Currency, conversion and persistence

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | `includes/functions.php:8926+` (`format_price`), `:10533` (`format_price_simple`); `templates/search-results.php:1010–1025`, `:1917–1920` |
| **Confidence** | **Extracted + corroborated** |

**Rate source.** The CRM returns a `currency_converter` block on **every** response, EUR-based:

```json
{"EUR":"1.0000000000","USD":"1.1687567934","PHP":"72.1823096972"}
```

There is no third-party FX provider and no scheduled refresh — rates arrive with the payload and are as fresh as the `wp_curl_info` cache entry, which has **no TTL** (PRD TF-03).

**Point of conversion — display time, never before.** `format_price($amount, $currency_code, $displaycurrency, $currency_converter)` multiplies the **stored base amount** by the target rate at render. Filtering happens on unconverted values (BPM-003).

**Formatting.**
- `NumberFormatter(get_locale(), NumberFormatter::CURRENCY)` with **`FRACTION_DIGITS = 0`** — prices show **zero decimal places**, always.
- Symbol substitution is per-branch string replacement: `EUR`→`€ `, `USD`→`$ `, `GBP`→`£ `, `PHP`→`₱ `.
- A currency with no matching branch falls through unsubstituted — which is the **root cause of CD-03**, the `¤` placeholder. It is a missing branch, not a broken locale.
- Note `format_price` reads `$value->default_price`, not `$value->price` (`:1485`).

**Persistence.** Display currency resolves as: `$_GET['currency']` → cookie **`form_displaycurrency`** → first key of the configured currency list. **A cookie, not a session or an account preference** — it will not follow a user across devices, and that is the current behaviour.

**Sign-off:** ☐

---

### BPM-009 · FR-SL03 / CD-01 · The shortlist count shortcode

| | |
|---|---|
| **Class** | F — **and the PRD's treatment of it is wrong** |
| **Source** | `wp_posts` ID **285388** (`customtemplates`, `custom-shortlist-grid-template-1`); exhaustive `add_shortcode` census across `plugins/respacio`, `themes/respacio`, `themes/newrespacio-child` |
| **Confidence** | **Extracted** |

`[respacio_shortlist_count]` is emitted by the shortlist grid template:

```html
<p class="text-white">[respacio_shortlist_count] Properties</p>
```

**It is never registered.** A full census of `add_shortcode()` across the plugin and both themes returns 27 registered tags; `respacio_shortlist_count` is not among them. WordPress leaves unregistered shortcodes as literal text — which is exactly the reported defect.

**This corrects PRD v2.1 CD-01**, which says *"The counting rule is frozen logic and must be captured."* **There is no counting rule to capture. There never was one.** The feature was templated and never implemented.

**Consequence.** CD-01 cannot be fixed by parity capture. Someone must *decide* what the number counts — properties currently matching the shortlist's saved query, a manually curated member list, or something else — and that decision is **new scope requiring client sign-off**, not a defect repair. It should move to the Deviation Register (GP.5) or become a new open question.

**Sign-off:** ☐ *(blocked — needs a client decision, not a signature)*

---

### BPM-010 · Similar properties — price band

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | `templates/search-results.php:351–376`; corroborated against 40 cached calls |
| **Confidence** | **Extracted + corroborated** |

Configured in the template as `price="+-N"`. The query becomes:

```php
min_price = round(price − (price × N ÷ 100))
max_price = round(price + (price × N ÷ 100))
```

**N = 40 in production.** Verified arithmetically against the cache: a ₱6,800,000 listing yields `min_price=4080000` (×0.6) and `max_price=9520000` (×1.4).

`round()` is applied to each bound — **half-up, PHP default, zero decimals**. Companion filters: `municipality` and `sub_type` are carried across from the source listing when configured `true`.

**Defect carried in this path:** `$similar_query['displaycurrency'] = "EUR"` is hard-coded at `:356` while the bounds are peso-denominated. See **CD-10**, §3.

**Sign-off:** ☐

---

### BPM-011 · Template rendering is not WordPress shortcodes

| | |
|---|---|
| **Class** | R — architectural, affects every P\* row below |
| **Source** | `add_shortcode` census (27 registered) vs. 372 distinct tags across the 286 template records |
| **Confidence** | **Extracted** |

The Respacio template DSL and the WordPress shortcode API are **two different systems**. Only 27 tags are registered with WordPress; the other ~345 (`[property_title]`, `[proprice]`, `[bedroomval]`, the `[remove_*]` family) are substituted by Respacio's own template renderer against the CRM payload.

**Build note.** Do not model the DSL as shortcodes. It is a token-substitution templating language over a JSON document, and the natural Payload/React equivalent is a field-mapping layer plus conditional components — closer to a rendering schema than to a block library. This should be settled before PRD §13.4 is frozen.

**Sign-off:** ☐

---

### BPM-012 · FR-SL02 · Shortlist population

| | |
|---|---|
| **Class** | P\* → **fully resolved** |
| **Source** | `wp_posts` shortlist bodies, `respacio-blocks/search-results` block `query` attribute; postmeta census across all 8 records |
| **Confidence** | **Extracted** |

**Every shortlist is rule-based. None is manually curated.** The postmeta census is decisive: `respacio_location_tree` and `_respacio_multi_location` are **empty on all eight records**, and there is no member list, no relationship field and no saved-query meta anywhere. The rule lives in the page body, as a URL-encoded query string in the `respacio-blocks/search-results` block attribute.

| Shortlist | ID | Saved query |
|---|---|---|
| Residential Lots | 284702 | `property_for=1&type[]=_st_8` |
| Condominiums | 284693 | `property_for=1&sortby=priority_desc&type[]=_st_38` |
| Luxury Houses | 284701 | `property_for=1&price=&min_price=19901000&max_price=100000000&type[]=_st_9` |
| Preselling Condotels | 310770 | `property_for=1&sale_detail_type[]=2&type[]=_st_94` |
| Foreclosed | 287940 | `property_for=1&sortby=priority_desc&fa[]=a143` |
| **Beachfront** | 310626 | `property_for=1&sortby=priority_desc&type[]=_st_7` |
| **Commercial** | 287902 | `property_for=1&sortby=priority_desc&type[]=_st_7` |
| *(draft, golf course)* | 310988 | `property_for=1&fa[]=a131` |

All eight render through the same template pair — `Property Grid Template - 1` / `Custom Property Grid Template – 4` — with `property_pagination: buttons` and `reset_search: true`.

**Parameter semantics.** `type[]=_st_{n}` selects a CRM property **sub-type** (`_st_` prefix + `property_sub_type_id`); `fa[]=a{n}` selects a **feature/attribute** ID; `sale_detail_type[]=2` selects **Preselling** (`1` = Resale, per the `properties/view` payload); `property_for=1` is **Sale**.

**All eight are Duplicate Post clones**, traceable through `_dp_original`: `284693 → 287902 → 287940` and `284702 → 310626 → 310770 → 310988`. Each also carries a `_yoast_post_redirect_info` 301 from its pre-rename slug — those are among the 59 redirects in FR-SE13 and must survive.

> ⚠ **Beachfront and Commercial carry byte-identical queries** (`type[]=_st_7`). One is wrong. See **CD-13**, §3.

**Consequence for CD-01.** Because population *is* rule-based, the missing `[respacio_shortlist_count]` (BPM-009) had an obvious intended meaning: the CRM result count for the shortlist's saved query. That makes the fix well-defined — run the query, read `total`, render it — and downgrades the scope question from "invent a rule" to "confirm the obvious one." It remains a client decision, but a much cheaper one.

**Sign-off:** ☐

---

### BPM-013 · FR-E02 · Insights pagination — **RESOLVED LIVE, and the PRD's URL form is wrong**

| | |
|---|---|
| **Class** | P\* → **resolved** |
| **Source** | `templates/post-loop.php:486–493`; live observation of `/insights/` 22 Aug 2026 |
| **Confidence** | **Verified against production** |

**Live result: 6 posts per page, 12 pages.** The observation in PRD §2.4 was right and the source's `posts_per_page` fallback of 9 is **not** what runs — some layer between the block and `post-loop.php` supplies 6. Since GP.2 makes the live site authoritative, **6 is the rule**; the mechanism supplying it is a curiosity, not a blocker.

**Three findings that change requirements, not just this row:**

1. **The pagination URL form is `?pageid={n}`, not `/insights/page/{n}/`.** FR-E01 currently says the rebuild must "preserve `/insights/page/{n}/` URLs". **Those URLs are not what the site emits.** Links are `<a class="page-link" data-pageid="2" href="?pageid=2">`. FR-E01 and the redirect map both need correcting.
2. **Pagination is AJAX.** Clicking page 2 fires `POST /wp-admin/admin-ajax.php`; a plain server fetch of `?pageid=2` returns markup with **zero** `.post-listing` elements. Content beyond page 1 does not exist without JavaScript.
3. **Page 2+ canonicalises to page 1.** `<link rel=canonical href="https://zetagroup.ph/insights/">` is emitted on `?pageid=2`, with **no `rel=prev`/`rel=next`**, and `robots: index, follow`.

**Combined SEO consequence.** Points 2 and 3 together mean the **63 articles beyond page 1 are effectively uncrawlable** — no server-rendered content, and every paginated view canonicalises away to page 1. This materially escalates PRD **CD-05**, which framed the problem as "80+ articles only reachable by pagination." They are worse than hard to reach; they are close to invisible. Note this also means FR-SE10 ("must not canonicalise page 2+ to page 1") is an **E-class fix**, not parity — the current site does exactly what FR-SE10 forbids.

**Sign-off:** ☐

Resolution order in `post-loop.php:488–493`, identical in shape to BPM-006:

1. `$args['post_limit_phone']` if the device is a Phone
2. `$args['post_limit']`
3. `get_option('posts_per_page')` → **9**

**The Insights post-grid block sets none of them.** Attribute inspection of ID 285696 shows `post_limit`, `post_limit_phone` and `post_offset` all unset; only `category: ["blog"]`, `posttemp: 943` and `custom_template: "Custom Post Grid Template"` are present.

**So source says 9. Observation (PRD §2.4) says 6, across 12 pages.** With 69 published posts: 9/page → 8 pages; 6/page → 12 pages. The observation is internally consistent, so it is not obviously a miscount — but nothing in the artefacts produces 6.

Unexplained secondary point: `category: ["blog"]` does not match any of the 8 real category slugs (`house-tours`, `real-estate-how-tos-tips`, `buyers-guide`, …). Either it is inert, or a filter is being applied that the artefacts do not reveal.

> ⚠ **This is exactly the situation GP.2 legislates for: where the document and the live site disagree, the live site wins.** Count the Insights index and record the true value before FR-E01 is built. Both candidate answers change the URL space (`/insights/page/8/` vs `/page/12/`), so this is a redirect-map input, not just a display detail.

**Sign-off:** ☐

---

### BPM-006a · FR-SR (pagination) · Phone page size: device class and per-module census

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | `templates/search-results.php:730–738`; `respacio.php:12–95`, `:966–967`; `includes/detect.php:66–68`; block defaults `blocks/search-results/search-results.php:66,72–73`, `search-results-map.php:62–63`, `property-grid.php:63–64`, `property-carousel.php:78–79`; WP core `class-wp-block.php:232`; `wp_posts` 6, 234194, 299846, 284693…310770, 295838, 295881, 275272 |
| **Confidence** | **Extracted**. What phones receive under WP Rocket's shared cache **needs live confirmation** (`phone-page-detection`) |

- **Phone** = Mobile_Detect `isMobile() && !isTablet()` (`detect.php:66–68`). A tablet is not a phone.
- **Absent is not empty.** WordPress fills registered block defaults before render, so a module with no `property_per_page_phone` gets `'9'` (`'6'` for property-carousel). On a phone, every module without its own phone size shows 9, whatever its desktop size.
- **Census of rendered modules:**

| Module | Desktop | Phone |
|---|---|---|
| Page 6 `/search_results/` search-results (layout_2, `ignore_get=false`) | **12** | 9 (default) |
| Page 6 search-results-map | 9 (default) | 9 (default) |
| Pages 234194 `/r/`, 299846 `/long-term/` similar-properties grid | 4 / 3 | **3** / 3 (explicit) |
| Shortlists 284693, 284701, 284702, 287902, 310626, 310770 | 12 | 9 (default) |
| Shortlist 287940 (foreclosed) | 9 (default) | 9 (default) |
| City Middle 295838 / Municipality Middle 295881 | 8 or 9 | 9 (default) |
| Complex Middle 275272 | 30 or 9 | 9 (default) |

- Page 6 stores `"property_per_page":"12"` with no phone size. The rebuild's `/search_results/` showed 9 before this capture; it now shows 12 on desktop.
- WP Rocket serves one cache to phones and desktops (`rocket_do_caching_mobile_files = 0`), so on cached URLs the device that primed the cache sets the size for everyone.

**Build notes.** `resolvePerPage` takes the module's phone size and the request's device class. `deviceType(userAgent)` is a compact equivalent of Mobile_Detect, not its full pattern list (**R**). Not reproduced: the unsanitised `?device=` override and the macOS `?res_dev=` round-trip (`respacio.php:17–95`), both debugging aids with no user-facing contract (CD-15 already makes the search page server-rendered).

**Sign-off:** ☐

---

### BPM-007a · FR-P11 · View-page map (`slugs.view`)

| | |
|---|---|
| **Class** | P\* → resolved |
| **Source** | `respacio.php:114`, `:250–266`, `:286–316`; `templates/search-results.php:408`, `:581–583`, `:1670`, `:1788–1806`; `includes/functions.php:695–722` (rewrites), `:6573–6635` (`single_property_session_set`); `wp_options.respacio_lng` |
| **Confidence** | **Extracted**. The canonical redirect **needs live confirmation** (`listing-route-redirect`) |

`slugs.view` is built per request from page slugs in `respacio_lng`: view `r` (page 234194), rent view `long-term` (page 299846); the rent-to-buy, short-rent and long-rent pages are unset or missing, so they fall back.

| `property_for_id` | Page | URL |
|---|---|---|
| `1` Sale, `3` Rent and Sale, missing (→ `1`, `:1670`) | 234194 | `/r/{ref}/` |
| `2` Rent, `4` Short rent, `5` Long rent | 299846 | `/long-term/{ref}/` |
| `6` | the view page of the request's `property_for`, when present | — |

- The key is `property_for_id . rent_period`, where `rent_period` is the **request's** parameter (`:581–583`), not the listing's `rent_amount_period`. No live results module sets it, so the key is `property_for_id` alone. The old interim keyed on the listing's rent period and was wrong for a Rent listing without one.
- `single_property_session_set` rebuilds the canonical link and `wp_redirect()`s (302) when the requested URL is not part of it: `/long-term/{sale-ref}/` → `/r/{sale-ref}/`, and any query string forces a redirect that drops it.

**Build notes.** `listingPath(listing, requestPropertyFor?)` implements the table. Both routes still serve any listing until the redirect is confirmed live. An undefined key (`property_for_id` 6 with no request `property_for`) links to the hosting page on production; the rebuild sends it to `/r/` (**F**).

**Sign-off:** ☐

---

### BPM-014 · FR-A04 / FR-A10 · Account identity and account area

| | |
|---|---|
| **Class** | P\* (feature not built) |
| **Source** | respacio `includes/functions.php:822–897`, `:8046–8100`, `:9365–9550`; `respacio.php:1503–1800`; `social.php`; `templates/misc.php:1291–1394`; `wp_posts` 274857 (`/my-account/`), CF7 274378, 274379, 310859; `wp_options` `respacio_misc`, `users_can_register`, `mo_openid_*` |
| **Confidence** | **Extracted**. CRM contact responses are not in the corpus (`contacts/*` is never cached) |

- **Identity** is a CRM contact cookie (`res_uid`, 90 days), not a WordPress login. It is set by an emailed access link ("My Account Access" form → `contacts/check_contact`) or by Google/Facebook social login (miniorange → `contacts/register` if new, then the WordPress session is logged out at once).
- **No e-mail verification** anywhere: WordPress registration is off, social login trusts the provider, the sign-up forms send no confirmation step.
- **Sign-up for a new email appears to create nothing**: both sign-up forms run the account-access branch, which skips the mail for an unknown contact, and the CRM sync only runs from the mail path (`account-registration`, live check).
- **`/my-account/`** (274857): "Personalize your search" (BPM-015), then with a contact: tabs Just For You (placeholder copy), Liked Properties, Saved Searches, Account (placeholder); "Welcome back [client_name]" and subscription toggles (Newsletter, New Property Matches → `contacts/subscribe_contact`). Without one: sign-up form, a hidden account-access form and benefit blurbs. Social login buttons always.
- **Favourites and saved searches are local only**: the CRM write calls are switched off (`respacio_misc` `SubmitFavProperty` / `SubmitFavSearch` = `no`), yet `/my-account/` overwrites the local lists with the CRM's on every visit (CD-17).

**Build notes.** Security-relevant implementation details of the live identity model are recorded outside this repository. The rebuild must use signed, expiring access links.

**Sign-off:** ☐

---

### BPM-015 · FR-A13 · "Please sign up to see your recommendation"

| | |
|---|---|
| **Class** | P\* → client decision (`recommendation-scope`) |
| **Source** | `customtemplates` 289707 ("Multistep form"), 289275 + `javascript` postmeta; modal `#popupemailmodal3` on pages 2 and 274857 |
| **Confidence** | **Extracted** |

The message is the fixed last step of a four-question survey (type, area, price range, Bank/Cash financing) in the "Get started" modal. Every visitor reaches it, signed in or not. The survey is never submitted (the last step sits outside the `<form>`, nothing serialises the answers, the Bank/Cash buttons have no name), and no code anywhere computes a recommendation. The step offers social login and the sign-up form (BPM-014). **There is no rule to port**: the client decides whether to keep the survey as a sign-up prompt, drop it, or specify a real recommendation.

**Sign-off:** ☐

---

### BPM-016 · FR-SR14 · Keyword search → `reference_no[]`

| | |
|---|---|
| **Class** | P |
| **Source** | `templates/search-results.php:464–500`, `:557–576`, `:817–823`; `includes/functions.php:997–1104` (`filter_auto_suggest`, `filter_auto_suggest_direct`); `templates/search-form.php:3770–3860`, `:4885–4935`; `wp_curl_info` 40 × `properties/filter_property` with paired `properties` calls |
| **Confidence** | **Extracted + corroborated**. Case sensitivity **needs live confirmation** (`keyword-case`) |

1. The live free-text field is `keyword_1` (City/Municipality search bars, home). A `_n` suffix counts only when `?property_for` is that sale type or absent (only 1–5 exclude); `_5` is never stripped, so `keyword_5` is never a keyword. A bare `keyword` always counts. The value is sent raw.
2. No live keyword field sets `fields=`, so the lookup uses `fields=reference_no` (`functions.php:1057`): `properties/filter_property` with the request's `property_for` (default `1`, Sale) and `property_per_page=50`.
3. The matches are appended to `reference_no[]` and **AND**-ed with every other facet. None → `reference_no[]=no results fake reference` (zero results). More than 50 → the rest are dropped.
4. Matching is CRM-side and partial: `ZTP73` returned ZTP730–739 (row 6035). Prefix and contains are indistinguishable on the corpus (all refs start `ZTP`). Rent refs looked up with `property_for=1` returned nothing (rows 6076, 6204, 6478).
5. **Titles are never matched.** The interim's `propertyTitle like keyword` had no basis and is removed.

The separate select-picker suggestion field (`property_filter`) exists only in vendor templates not confirmed live; its picks replace `reference_no`.

**Build notes.** `resolveKeyword` (params) + `keywordRefs` (query): case-insensitive contains on `referenceNo`, scoped to `property_for` (default `1`), capped at 50, sorted by reference (the CRM's order is CRM-side), unioned into `referenceNos`, none → the fake reference.

**Sign-off:** ☐

---

### BPM-017 · FR-L02 / FR-L03 · City vs barangay location templates

| | |
|---|---|
| **Class** | P\* (feature not built) |
| **Source** | `autotemplate` 275060 / 275075 / 275078; `dynamicsection` 275258, 295881, 275262 (municipality) and 275264, 295838, 275268 (city); postmeta `_respacio_province_muni_town_complex_level` / `_name`; respacio `includes/functions.php:4782–4840`, `:5167–5368`; `templates/misc.php:20–240`, `:1396–1480`, `:2041`; child theme `functions.php:3855–4084` |
| **Confidence** | **Extracted**; first tab, hidden sections and two CRM combinations **need live confirmation** (`location-page-live-checks`) |

- The site's **city** page is CRM level `municipality`; its **barangay** page is CRM level `city` (child of the municipality page); a third level `complex` covers developments.
- Chosen once, at generation: the page body is copied from autotemplate 275060 (municipality) or 275075 (city) and hard-codes three dynamic sections (Top/Middle/Bottom), loaded by exact title. `[query]` becomes `area[]={deepest non-zero level}_{id}`.
- 152 published location pages: 21 municipality, 57 city, 53 complex (+1 mixed), 20 without level meta (Municipality sections; may render an empty name).

| # | City page (municipality) | Barangay page (city) |
|---|---|---|
| Top | H1, save-location button | H1, "There are [count] property for sale in …" (`_respacio_count`), save-location button |
| Resale tabs (`property_for=1`, `sale_detail_type[]=1`, 8/page) | All, House `_st_9`, Residential Lot `_st_8`, Condo-Condotel `_st_10/38/94`, Commercial `_st_7`, Agri-Industrial `_st_53/52` (no sale_detail_type); `area[]=municipality_{id}` | All, House (`priority_desc`), Residential Lot (no type, adds `area[]=municipality_{id}`); three tabs hold placeholder text (CD-18); `area[]=city_{id}` |
| Pre-selling tabs (`sale_detail_type[]=2`) | All, House (date_desc), Residential Lot, "Commercial" holding condo types, Condo (date_desc), Agri `_st_52/54` | All, House, Lot, Condo&Condotel, "Condo" holding `_st_7/54`, Agri (malformed query, CD-19) |
| Map | Polygon map of every complex in the municipality | Developments tag cloud (this barangay), then a polygon map with no action |
| Bottom | Hidden "City Guide" directory grid | Hidden "Neighborhood Guide" directory grid |
| More About | Blogs/Shorts post grids (6/page; category ignored, location meta LIKE; on city pages the 2nd tab can never match) | same |
| Explore | `[location_list]` from CRM `properties/province_municipality_city_complex`: neighbourhoods, subdivisions (strcmp), new developments (capped at 9 by `posts_per_page`, title DESC) | same, own barangay marked active |

**Sign-off:** ☐

---

### BPM-018 · FR-E04 / FR-E05 · Article template and block census

| | |
|---|---|
| **Class** | P\* (feature not built) |
| **Source** | `themes/respacio/single.php`; child `loop-templates/content-single.php`, `template-parts/content-header.php`, `tpl-fullwidthimage-nosidebar.php`; `respacio/inc/setup.php:139–160`; `theme_mods_newrespacio-child`, `sidebars_widgets`; 69 published posts |
| **Confidence** | **Extracted**; the double H1 **needs live confirmation** (`article-double-h1`) |

- **Default template (62 posts):** H1 title over the featured image banner (or alone without one); breadcrumbs off; body; `bottompostcontent` widget (social follow); `wp_link_pages`; previous/next post links (any category); comments open on all 69. Author, date, category, tags and reading time are **not** rendered. No sidebar.
- **Full-width variant (7 posts: 288471, 294367, 294368, 294649, 311627, 311866, 311944):** H1 over the image, content, comments, **no previous/next**.
- Every body also starts with its own H1 (56 Spectra `advanced-heading` blocks), so the page carries two H1s.
- **Block census** (69 posts, all block editor): core paragraph 2175, list-item 941, heading 279, list 243, separator 22, image 21, group 9, spacer 6, quote 1. **Need their own renderer:** Spectra `uagb/advanced-heading` 61, `uagb/container` 58, `uagb/image` 46, `uagb/buttons` 4+4; `core/embed` 41 (all YouTube); `yoast-seo/breadcrumbs` 10; `core/html` 5 (social icons); `core/shortcode` 5 (one CF7 form); `respacio-blocks/shortlist-grid` 1.

**Sign-off:** ☐

---

### BPM-019 · FR-E20 · Directory grid filters

| | |
|---|---|
| **Class** | P\* — built 24 Nov 2026 (`@zeta/parity/directory`, development pages, `/directory/{slug}/`) |
| **Source** | respacio `includes/cpt-directory.php`; `blocks/infinity-directory-grid/`; `respacio.php:1078–1110`; `templates/post-loop.php`; `includes/functions.php:2042–2786`; `dynamicsection` 290013, 308024, 275262, 275268; `customtemplates` 289463 |
| **Confidence** | **Extracted** |

- The only **visible** directory grid is the first section of Complex Bottom (308024), on the 53 complex pages. The City/Municipality grids are hidden; 290013 is orphaned.
- Data: 25 `directory` posts in `directory-category` (mall 5; videos, shorts, blogs, building, complex 3 each; parks, public-services, lorem-ipsum 2; schools 1).
- Query: published `directory`, `date DESC`, `post_limit` per page (6 on Complex Bottom), current page excluded. `post_tax` `directory-category|!A,!B` is one `NOT IN` clause on slugs; clauses join with OR (AND when a global `tag` is set). Location filtering exists but no instance sets it. The editor's "Directory Categories/Tags" controls are dropped and do nothing.
- Filter UI: "All" plus the categories **present on page 1**, by name ASC; hidden when `?q=` is set. A tab click **replaces** the taxonomy query with that one slug, dropping the exclusions (CD-20). `?q=` adds a text search.
- Paging is unset on every instance: only the first N cards ever show.
- Empty: "No data found" (server); an empty ajax tab leaves the grid blank. Card: image, title, excerpt, permalink.
- Worked result, Complex Bottom: 8 posts survive the exclusions; tabs **All, Mall, Public Services**; the schools and parks posts are unreachable.

**Side finding:** BPM-013's 6 per page is the post-grid block's registered default `post_limit` `'6'` (`blocks/post-grid/post-grid.php:61`); its `category` is reset at `post-loop.php:13`.

**Build.** `selectDirectory` (`@zeta/parity/directory`, parity tests reproduce the worked result) feeds the "Directory" section on every development (subdivision) page; tabs are client-side swaps of server-selected cards. Entries keep all their categories (`categories` hasMany) and their WordPress date (`createdAt`). `?q=` text search is not built: no live link sets it on a location page.

**Sign-off:** ☐

---

### BPM-020 · FR-D01 / FR-D04 / FR-P01 / FR-P02 / FR-P10 · Listing detail field set

| | |
|---|---|
| **Class** | P\* → captured, not built (`listing-field-render-set`) |
| **Source** | Pages `wp_posts` 234194 (`/r/`) and 299846 (`/long-term/`): block `respacio-blocks/property-view {"template":"Property View 6","custom_template":"custom property view","breadcrumb":"style3"}`, `/long-term/` adds `"rent_period":"2"`. Template `customtemplates` **288102** "custom property view" (markup `post_content`, CSS `post_excerpt`, JS postmeta 261064). Interpreter respacio `templates/single-property-view.php` (spv) and `includes/functions.php` (fn) |
| **Confidence** | **Extracted**; field presence corroborated against the 73 detail fixtures. CSS/JS-dependent visibility **needs live confirmation** |

**Template language** (spv): `[token]` is plain substitution (spv:1642–1777). `remove_[remove_X]_` writes 1 when X is set, `''` when empty; `eq=`/`neq=` write 0; `dommanipulation()` (fn:6901) deletes elements whose class holds `remove_0` or `remove__`, and `remove_ne_X_` when X is set (fn:6932–7057). `[attributes_ids|…]` prints matching attribute values in **CRM order**, not template order (spv:2737–2838). `[custom_name]` reads `property_custom_fields`. The `template` attribute is ignored once `custom_template` is set (spv:88–93).

**Desktop, in DOM order** ("rm" = removed from the HTML):

| # | Section | Label | Source field | Condition | Formatting |
|---|---|---|---|---|---|
| 1 | Header | title (h4) | `property_title` | always | |
| 2 | Header | "for {property_for}" ribbon | `property_for` | always | probably capitalised by page CSS (live) |
| 3 | Header | marketing ribbons: exclusive, price_changed, new, hot_deals, rush_sale, direct_listing, newly_listed, is_foreclosed | `marketing_feature_en` keys | each when present | "Zeta Exclusive" and "Preselling" never render (CD-28) |
| 4 | Header | price (h4) | `default_price` + `currency_code` → `format_price` (BPM-008); empty → "POA" | **only on `/r/`** (`property_for_url` 1) | display currency per BPM-008 (CD-21) |
| 5 | Essentials | "{n} Beds" | `bedrooms` | always | "0" shows "-" (CSS `is0empty`) |
| 6 | Essentials | "{n} Baths" | `bathrooms` | always | as 5 |
| 7 | Essentials | "1 Parking" | none: literal "1" | always | CD-22 |
| 8 | Essentials | "{plot_size} sqm lot" | `plot_size` | always | sqft with conversion if `measurement=imperial` |
| 9 | Essentials | "{built_size} sqm floor" | `built_size` | always | as 8 |
| 10 | Header | Save / Share | `reference_no` | always | |
| 11 | Sub-nav | Back · Overview · Feature · Location · Property Info · Places of Interest · Price History · Payment Calculation · Similar properties | — | always | |
| 12 | Gallery | "Show {n} photos and videos", 1 large + 4 small | `photos` (n counts images only), `video[0]` | 2nd tile is the first video if any | |
| 13 | Media tabs | Overview · Photos · 360 Virtual Tour · Floor Plan · Video | `iframe_url`, `floor_plans`, `video` | each rm when empty | |
| 14 | Breadcrumb | "House in {Home / municipality / city / complex / ref}" | `municipality_name`, `city_name`, `complex_name`, `reference_no` | complex only with a city | "House" is literal for every type (CD-23) |
| 15 | Overview | — | `description` | always | `nl2br`; for New Development (`sale_detail_type_id` 2) `[Label: a - b]` → "Label from a to b." |
| 16 | Features | "Features" | feature values (Nearby Amenities, Transport, Community, Location); when the listing has attribute values, the **symmetric difference**: attribute values not among the features (sorted), then feature values not among the attributes (sorted) (spv:1258–1302, corrected on build) | heading always | lower-cased, de-duplicated, two columns |
| 17 | Location | "Location" | `latitude`, `longitude` | map rm when either is empty | |
| 18 | Property Info | Type | `property_sub_name` | always | |
| 19 | 〃 | Subtype | `property_sub_sub_name` | rm if empty | |
| 20 | 〃 | Payment Term | `property_custom_fields.payment_terms` | rm if empty | never renders: the data is in `custom_property_fields` (CD-29) |
| 21 | 〃 | Title Status | `property_custom_fields` title status | rm if empty | as 20 |
| 22 | 〃 | Storey | `storeys` | rm if empty or "0" | |
| 23 | 〃 | HOA/Condo fees | `community_fees_monthly` → `format_price` | rm when empty | |
| 24 | 〃 | RPT(yearly) | `local_tax_yearly` → `format_price` | rm when empty | |
| 25 | 〃 | Required Income | `custom_required_income` | rm if empty | |
| 26–37 | 〃 | Pool · Parking · Telecoms and Security · Orientation · Exterior Features · Decor · Rooms · Furnishing · Condition · Lot Type · View · Is Foreclosed ? | attribute id lists (template T:487–596; View excludes 145 "Beachfront", CD-24) | each rm unless one of its ids is present | values in CRM order |
| 38 | 〃 | Year Built | attribute ids 113–119 (not `built_year`) | only when the media count is exactly 1 | CD-25 |
| 39 | Places of Interest | "Places of Interest" + 10 filter buttons | `nearest_location[]` | map always; markers where lat/lng exist | |
| 40 | Price History | Date / Change / Previous Price | `price_history[]` | empty → "Price history not found."; rows missing a price skipped | `j M Y`; ▲/▼ rounded %; previous price is the raw CRM string |
| 41 | Payment Calculation | monthly amount, "{n} year fixed {r}% interest", principal, interest | hidden price | always | terms 1–30 y, rates 6.55–8.25 %, downpayment slider 10–90 (CD-26) |
| 42 | Sidebar | agent card + enquiry form (CF7 235756) | literal agent details | always (sticky) | Request Visit / Video panes unreachable |
| 43 | In-content enquiry | "Find out more about …" / "Make a booking request for …" | — | removed (sticky-enquiry option) | |
| 44 | Gallery modal | share links | literal `/r/ZTP116/` | always | CD-27; Copy Link uses the real URL |
| 45 | Form prefill | message fields | `property_title`, `reference_no`, view link | always | |

**Mobile-only:** a title block (title, "for …", one combined ribbon followed by a literal "NEWLY LISTED") and a hero block (ref, price, bed/bath/floor/lot icons) that CSS probably hides on every device (live).

**`/r/` vs `/long-term/`:** same template. `/long-term/` sends `property_for=2&rent_period=2` to the CRM, **shows no price** (row 4 and the mobile block have no variant for it; CD-21), and its Similar Properties grid has no sub-type filter, 3 per page, and keeps its heading when empty.

**Never rendered:** `documents`, `logo`, `panoramic`, `vimeo_url`, `marketing_channels`, `additional_services`, `contract_period`, `unique_selling_point`, `rental_rates`, `property_sizes`, `custom_property_fields`, `assign_user`. Of the 113 detail keys only 21 are read (listed in the rows above plus the breadcrumb location ids).

**Side finding (`withdrawn-listing-url`):** a non-success or `is_record≠1` response renders "Oops this property has been sold" (spv:2994–3005); the HTTP status is not visible in code.

**Sign-off:** ☐

---

### BPM-021 · FR-SR02..SR07 · Search form → URL contract

| | |
|---|---|
| **Class** | P\* → resolved (param names); three behaviours **need live confirmation** (`fa-collision`, `type-tree-combination`, `payment-terms-filter`) |
| **Source** | `wp_posts` 6 (blocks); `customtemplates` **305520** "Advance Search - Inline - Sale - Responsive 3" (the visible bar) + its `javascript` postmeta; `templates` 263744 "Search Result Wrapper Mix"; respacio `templates/search-form.php`, `templates/search-results.php`, `includes/functions.php`, `js/respacio.js`, `js/respacio-core-a.js`; `uploads/custom-css-js/295305.js`; `wp_curl_info` 6382/6487 (option labels) |
| **Confidence** | **Extracted**; partly corroborated (`attribute[0]=143` call 6460, `sub_sub_property_type[0]=44` calls 5971–5997, `sale_detail_type[]` in 567 calls) |

**Submission.** Every control writes into one object, then `history.pushState("?"+jQuery.param(...))` and an AJAX refresh of the grid and count (`action=search_property_list`); never a page load. Every handler sets `pageid=1`. Brackets are percent-encoded.

| Control | Query parameter | Notes |
|---|---|---|
| Sale / Rent | `property_for=1` / `2` | "Rent and Sale" (3) excluded |
| Property Type | `type[]=_st_{id}` (sub-type), `type[]=_sst_{id}` (sub-sub-type) | two branches, Residential first, A–Z; a child is disabled until its parent is ticked; ticking a parent clears its children and vice versa (`search-form.php:1340–1525`). Server: `_st_` → `sub_property_type[]`, `_sst_` → `sub_sub_property_type[]` (`functions.php:3050–3059`) |
| Bedrooms / Bathrooms | `min_bedroom=N` / `min_bathroom=N`, options 1–6, 6+ | min only; `6+` sanitises to 6 |
| Price | `price=&min_price=a&max_price=b`, 1,000–100,000,000, step 50,000 | the form never sends a `+` |
| Show Properties Above ₱100,000,000+ | `min_price=100000000&max_price=1000000000` | ceiling = 10 × the slider max (`search-form.php:5285`) |
| Sales Details | `sale_detail_type[]=1` Resale, `2` New Development | |
| Property View | `fa[]=a129` Mountain, a130 River, a131 Golf Course, a132 Sea, a133 Garden, a134 Amenity, a135 City, a137 Sunset | a136 not in the CRM list, never renders |
| Lot Type | `fa[]=a119` Inner, a120 Corner, a121 Fairway, a122 Ridge, a123 End, a144 Through | |
| Is Foreclosed? | `fa[]=a143` Yes, `a142` No | single choice |
| Payment Term | `payment_terms[]=Cash` / `Deferred Cash` / `Bank Financing` / `Pagibig Financing` | passed to the CRM untouched; 0 corpus calls |
| Lot / Floor Area | `min_plot_size`, `max_plot_size`, `min_total_built_size`, `max_total_built_size` | free text, raw |
| Year Built | `min_built_year`, `max_built_year` | raw on the AJAX path; the page-load path runs `DateTime(...)->format('Y')` (CD-31) |
| Storey | `min_storey[]=1…4` or `5+` | single choice, sent raw |
| Order By | `sortby=date_desc` Newest, `price_asc`, `price_desc` | shows "Newest" when absent while results are `priority_desc` (CD-30) |
| Currency pill | sets `form_displaycurrency`, full reload (BPM-008) | |
| Show Map | `map=true` and a full load | FR-SR16 (Phase 2) |
| Save Search | session toggle, opens a sign-up modal | account area (BPM-014) |

The "Show {n} results" count is the same AJAX response's `totalrecords`, written only when > 0.

**Build notes.** `@zeta/parity/search/form` holds the options, the tree rule (`toggleType`) and the URL writer (`withParam`, resets `pageid`); `parseSearch` now reads `_sst_`, the area boxes, storey, year built and payment terms; the mirror gains `subSubTypeId/Name`, `storeys`, `builtYear`. Each change navigates to the same URL and the server renders it (**E**: same URL, same results, server-rendered). "Clear Filters" returns to `?property_for={n}` (the live outer link points at a non-existent `/search_result/`, CD-32).

**Build notes (24 Nov 2026).** Built as `ListingView` (both routes) from `@zeta/parity/listing` (`newDevelopmentDescription`, `priceHistoryRows`, `featureList`, `attributeRows`, `similarPriceBounds`), reading the CRM detail payload (`crmPayload.view`) where synced. Defects CD-21/22/23/25/26/27/29 are fixed in the interim and CD-24/28 reproduced, pending the client's GP.5 decisions (`listing-defects`). The live Google maps become an OpenStreetMap embed; Places of Interest is a list until a map is chosen.

**Sign-off:** ☐

---

### BPM-022 · WP-10 / FR-H06 · Location grid (respacio-blocks/location-grid)

**Source:** page 285273 (`/preselling-developments/`) `respacio-blocks/location-grid` {tag: new-developments, post_limit 12, grid col-lg-3}; production HTML 24 Nov 2026.

**Rule.** The grid lists location posts carrying the block's location tag **and a featured image**, newest first, up to `post_limit`. Each tile: the featured image, "Property for sale in {location}, {parent location}", "Find out More" to the location URL; no listing count. On production 26 locations are tagged `new-developments` and 2 have a featured image (Kensington Sky Garden, Teakwood Hills), so the page shows 2 tiles.

**Build.** `migrate:wp` selects the same set into a `homeLocations` block with `tileStyle: development`; editors add locations by hand afterwards.

## 3. Defects discovered during capture

New since PRD v2.1. **None may be silently fixed** — each is either reproduced or raised through GP.5.

| ID | Defect | Evidence | Proposed class |
|---|---|---|---|
| ~~CD-09~~ | ~~The price slider's top stop transmits a hard `max_price=100000000` ceiling~~ — **WITHDRAWN.** The observation was the Luxury Houses shortlist query, not a slider search (BPM-003, BPM-012). No defect is established. The slider's true behaviour is uncaptured | — | *withdrawn* |
| ~~CD-07~~ | ~~`console.log(result)` on an undefined variable prevents the redirect handler binding~~ — **WITHDRAWN.** Live check: `typeof window.result === "object"`, so nothing throws. "See Qualified Properties" was clicked and navigated correctly to `/search_results/?amount=3869475.19`. **No defect.** The hedge on this row was correct — it was never asserted as real | Live, 22 Aug 2026 | *withdrawn* |
| **CD-08** | **CONFIRMED, with a caveat.** Logged out, **all five** gated-download buttons on `/buy/` target `#loginsignupmodel` (the login prompt), not `#Download_model` (the download form). A logged-out visitor cannot reach any gated PDF without creating an account. Whether that is the intended lead-gate or the inverted UAGB condition I suspected **cannot be settled without a logged-in comparison** — the two variants differ only by user state, and I have no credentials | Live, 22 Aug 2026 | **F or intended** — needs a logged-in check before classification |
| **CD-15** | **`/search_results/` is not server-rendered.** An uncached first hit returns **271 bytes** of JavaScript that reads `window.innerWidth`, appends it as `res_dev`, and reloads. Without JS there is no search page at all. This is also the origin of the `res_dev` parameter seen on 43 cached CRM calls, and it corroborates the device-aware sizing in BPM-006 | Live, 22 Aug 2026 | **E** — the rebuild should server-render; confirm the `res_dev` contract is preserved or replaced deliberately |
| **CD-16** | **Insights pages 2–12 are AJAX-only and canonicalise to page 1** — see BPM-013. 63 of 69 articles are effectively uncrawlable | Live, 22 Aug 2026 | **E** — escalates CD-05 |
| **CD-13** | **Beachfront and Commercial shortlists carry byte-identical queries** (`property_for=1&sortby=priority_desc&type[]=_st_7`). Two separate primary-nav destinations, cloned via Duplicate Post, showing the same inventory. At most one can be correct | `wp_posts` 310626 vs 287902 | **F** — but which one is wrong is a **client question**; the correct sub-type ID for the other is not recoverable from the artefacts |
| **CD-14** | Luxury Houses is defined by a hard-coded price band `min_price=19901000&max_price=100000000`. It silently excludes anything above ₱100M, and the ₱19,901,000 floor is an oddly precise magic number with no evident derivation | `wp_posts` 284701 | Reproduce as-is; raise the ceiling with the client under GP.5 |
| **CD-10** | The similar-properties query hard-codes `displaycurrency="EUR"` while sending peso bounds | `search-results.php:356`; 40 cached calls | **F** |
| **CD-11** | **`sortby` is unsanitised.** `$_GET['sortby']` is `explode`d and passed to the CRM as `order_by`/`order` with no allow-list. The cache contains search keywords sitting in `order_by`: `yacht insurance companies`, `18引用 硫化氢通`, `wai\\\'ula\\\'ula i101 mauna kea`, `sarah van horn grey\\\\\\'s anatomy` — with visible repeated-escaping layers | Cached corpus, 40 calls | **F** + security review |
| **CD-12** | `min_X=0` is transmitted on every banded range search even when the user set no lower bound (`:637–639`) | `search-results.php` | Reproduce; flag only if it changes results |
| **CD-17** | `/my-account/` overwrites the visitor's local favourites and saved searches with the CRM's lists on every visit, but the site never writes to the CRM (`SubmitFavProperty`/`SubmitFavSearch` = `no`) | respacio `respacio.php:1749–1800`; `wp_options.respacio_misc` | **F** — client: should favourites sync to the CRM? |
| **CD-18** | Barangay resale tabs Condo-Condotel, Commercial and Agri-Industrial show placeholder text ("test 4", "test 5", "Test6") instead of listings; several pre-selling tab labels do not match their queries | `dynamicsection` 295838 | **F** |
| **CD-19** | Barangay pre-selling Agri query is malformed (`area_1%5B%5Dcity_` has no `=`) | `dynamicsection` 295838 | **F** |
| **CD-20** | Directory tabs drop the grid's category exclusions when clicked, and only categories present on page 1 become tabs | `post-loop.php:588–642`, `:2028–2053` | **F** |
| **CD-21** | `/long-term/` listing pages show no price at all | `customtemplates` 288102 T:72, T:266–269 | **F** — client |
| **CD-22** | "1 Parking" is a hard-coded literal on every listing | 288102 T:88 | **F** |
| **CD-23** | The breadcrumb line reads "House in …" for every property type | 288102 T:333 | **F** |
| **CD-24** | The View row omits attribute 145 "Beachfront" | 288102 T:579–587 | **F** |
| **CD-25** | "Year Built" reads attribute ids 113–119 instead of `built_year`, and shows only when the listing has exactly one media item | 288102 T:599–607 | **F** |
| **CD-26** | Listing payment calculator: the downpayment slider is subtracted as pesos, not %, `parseInt` truncates the rate, and changing the rate does not recalculate | postmeta 261064 | **F** — distinct from BPM-001's frozen loan calculator |
| **CD-27** | Gallery share links (Facebook, Twitter, LinkedIn) are hard-coded to `/r/ZTP116/` on every listing | 288102 T:816–827 | **F** |
| **CD-28** | Marketing features "Zeta Exclusive" and "Preselling" never show a ribbon (their keys are not in the template's list) | 288102 T:51–58; 73 fixtures | **F** — client |
| **CD-29** | Payment Term, Title Status and Required Income read `property_custom_fields`, which is empty in 73/73 listings; the data is in `custom_property_fields` | 288102 T:432–485; fixtures | **F** |
| **CD-30** | Order By shows "Newest" when no `sortby` is set, while the results are `priority_desc` (BPM-002) | `search-form.php:6205–6221` | **F** — the rebuild labels that state "Featured" |
| **CD-31** | Year Built on a page load runs `new DateTime($v)->format('Y')`: "2015" parses as a time (20:15) and gives the current year; "1990" may throw. The AJAX path sends it raw, so a reload can change results | `search-results.php:197–204` | **F** — the rebuild uses the raw year |
| **CD-32** | The outer "Clear Filters" link goes to `/search_result/` (singular); no such page exists | 305520 `javascript` | **F** — the rebuild clears to `?property_for={n}` |
| **CD-34** | The search page's "Show Map" switch does nothing: `toggleContent()`'s show/hide lines are commented out in the definition the page runs | live check 24 Nov 2026; page template `#switch_to_map` | **P** — not reproduced (no dead control); a map view would be an E-class addition (FR-SR16) |
| **CD-33** | The Buy page's "Explore Pre-selling Properties" button links to `/new-development/`, which is a 404 ("Page not found") on production | page 285440 `core/button`; live check 24 Nov 2026 | **P** — link kept as-is (parity); client to choose the target (likely `/preselling-developments/`) |

**CD-11 is the one to look at hardest.** Arbitrary user-controlled strings are reaching a third-party API in a parameter that names a sort column. It is at minimum a correctness bug and potentially an injection surface on the CRM side. It should be reported to Respacio regardless of what this project does.

---

## 4. Outstanding — 1 rule not yet captured

Session 4 (23 Nov 2026) captured every rule readable from the local artefacts: BPM-006a, BPM-007a and BPM-014 to BPM-020. What remains is blocked externally or needs production.

| Requirement | What is still needed | Blocked on |
|---|---|---|
| FR-F02, F03, F04, F06 | Field names, order, labels, required flags, validation, consent wording, recipient routing of the live forms | **OQ-17**: which of the 89 `wpcf7_contact_form` records are live |

Live checks and client decisions raised by session 4 are in `docs/PENDING.md` (`fa-collision`, `type-tree-combination`, `payment-terms-filter`, `phone-page-detection`, `listing-route-redirect`, `keyword-case`, `account-registration`, `location-page-live-checks`, `article-double-h1`, `recommendation-scope`), with defects CD-17 to CD-29 in §3.

### 4.1 Live check sweep — results

Run 22 August 2026 against production via Playwright. Four items closed, two still outstanding, two newly blocked on the client.

| Check | Resolves | Status |
|---|---|---|
| ~~Count the Insights index and its last page number~~ | BPM-013 / FR-E02 | ✅ **Done** — 6/page, 12 pages, `?pageid=n`, AJAX, canonical collapse |
| ~~Click "See Qualified Properties" after a calculation~~ | CD-07 | ✅ **Done** — works. Defect withdrawn |
| ~~Verify the calculator formula end-to-end~~ | BPM-001 | ✅ **Done** — exact to the centavo. `GM-CALC-001` |
| ~~Load `/buy/` logged out~~ | CD-08 | ⚠️ **Half done** — logged-out confirmed; **needs a logged-in comparison** |
| Exercise the price slider at its top stop; capture the outbound request | BPM-003 — the `+` semantics | ⬜ Outstanding |
| ~~Submit a banded facet with an open-ended top band; confirm whether `max_X=0` means "no ceiling" or "zero"~~ | BPM-005 | ✅ **Done** 24 Nov (§4.2) — no ceiling |
| Fetch one sold/withdrawn reference number | BPM-007 / FR-P11 | ⬜ **Blocked** — needs a sold reference number from the client |
| Does `?amount=` actually filter the search? | BPM-001 follow-on | ⬜ **Inconclusive** — the A/B was confounded by CD-15's JS bootstrap and by per-query-string page caching. Retest with JS enabled on both variants |

**Two credentials-blocked items** now gate the rest: a staff login (CD-08) and one sold reference number (FR-P11). Both are one-line asks to the client.

### 4.2 Live check sweep 2 — 24 Nov 2026

Read-only GETs against production (desktop: `?res_dev=1440`, phone: iPhone UA + `?res_dev=390`; result totals = (last `pageid` − 1) × page size + last page). Sale listings, 487 in total that day.

| Check | Observation | Rule / effect |
|---|---|---|
| `phone-page-detection` (BPM-006a) | Phone 9 cards, desktop 12, with and without a cache-buster; the body class follows `res_dev` | Phones get the module phone size (9). Interim confirmed; no change |
| `listing-route-redirect` (BPM-007a) | `/long-term/ZTP135/` → 302 `/r/ZTP135/`; `/r/ZTP611/` (rent) → 302 `/long-term/ZTP611/`; any query (`?x=1`, `?currency=USD`, `?res_dev=`) → 302 to the bare path, no currency cookie set | Built: `src/proxy.ts` (query → 302) and `ListingView` (wrong view page → redirect; Next answers 307) |
| `keyword-case` (BPM-016) | `ZTP135`, `ztp135`, `TP135` → ZTP135; `ZTP13` → 8 | Case-insensitive contains. Matches the build (`contains` = ILIKE) |
| `type-tree-combination` (BPM-021) | House 131, Studio 30, both 161 | OR across sub-type and sub-sub-type. Interim confirmed |
| `area-facet-combination` (BPM-004) | Davao 24 + CDO 334 → 358; Patag 2 + Carmen 44 → 46; CDO + Patag → 2; Davao + Patag → 0 | **OR within a level, AND across levels** (municipality, barangay, complex). Interim (OR across all) was wrong; fixed in `query.ts` |
| `fa-collision` CRM side (BPM-004) | Mountain 117, Corner 43, both 17 | The CRM ANDs `fa[]`. Whether the live form sends both selects still needs a browser |
| `band-max-zero` (BPM-005) | `min_bedroom=3` 124; with `max_bedroom=0` 124 | `max=0` is no ceiling. Interim confirmed |
| `location-grid-images` (WP-10) | `/preselling-developments/` renders 2 tiles (Kensington Sky Garden, Teakwood Hills) of the 26 locations tagged `new-developments` — exactly the 2 with a featured image; tile text "Property for sale in {name}, {parent name}" | **BPM-022**: the location grid lists tagged locations that have a featured image (limit 12). Built in `migrate:wp` and the `homeLocations` development tile style |
| `new-development-url` | `/new-development/` → device shim → 404 "Page not found" | CD-33 |

### 4.3 Search page side by side — 24 Nov 2026

Production and the rebuild driven in a browser on the same URL (`/search_results/?property_for=1`).

| Live | Rule (source) | Build |
|---|---|---|
| The header search is a **location picker** (bootstrap-select on `select[name="area_1[]"]`): municipalities shown as "(City)"; typing shows matching barangays ("- Patag") and developments under their municipality; Select All / Deselect all on what is listed; "Search" (or closing with a selection) submits | `search-form.php` area options (levels municipality, city, complexname; data-parent); `search-results.php:4258–4300`: on `/search_results/` the picker is one of the results filters (other filters kept, page reset); elsewhere the header form starts a Sale search | `LocationPicker` in the header; options from the CRM location tree (`properties/province_municipality_city_complex`, stored in `crm-state` by the sync; fixture recorded from the production picker). Typed text with nothing ticked runs the E-class free-text search (`q`) |
| Picker URLs are `area_1[]=municipality_25956` | `search-results.php:470–503`: a key ending `_1`…`_5` applies only when `property_for` is that number (or absent), suffix stripped; `:505–527`: `area` values `province_`, `municipality_`, `city_`, `complexname_`/`complex_` | `normaliseSuffixedKeys` + `parseSearch` (parity tests). Before this, live picker links returned unfiltered results here |
| Card type line: "House", "Commercial" | Template 276562 `.subtype`: the sub-sub type span is removed when a sub type exists | `cardTypeLabel` (sub type, else sub-sub type). The build had it reversed |
| Card photos page with ‹ › and carry a favourite star | `[property_slider]`, `[property_favourite]` | `CardMedia`; the star leads to sign-in until the account area exists. List payloads carry one photo, so the slider shows where the mirror has the detail gallery |
| Order By shows the placeholder "Order By" when no `sortby` is set | — | CD-30 no longer reproduces as recorded (it showed "Newest"); the rebuild's "Featured" label stays |
| Show Map toggle; Save Search | `[property_showonmap]`; saved searches | Save Search needs the account area. The Show Map switch is dead on production (CD-34): no map view built |

### 4.4 Listing page side by side — 24–25 Nov 2026

`/r/ZTP815/` and `/r/ZTP128/` on production and the rebuild. Rows refer to BPM-020.

| Row | Live | Build before | Now |
|---|---|---|---|
| 10 | Save (`[property_favourite]`) + Share | Share only | Save (sign-in until the account area) + Share |
| 11 | "Back" (`window.history.back()`) first in the sub-nav | missing | `BackLink` |
| 12–13 | Gallery tiles and the media tabs Overview · Photos · 360 Virtual Tour · Floor Plan · Video open the gallery modal | tiles only; media in a separate section when > 5 photos | `ListingGallery`: tiles, tabs (each removed when empty) and a viewer dialog |
| 39 | The 10 place filters and the map always show (no `nearest_location` in any recorded listing) | a list, or "No places of interest listed" | `PlacesOfInterest`: filters + map always |
| 41 | Opens at Price, Downpayment 10, Payment Term 1 Year, Interest Rate 6.55 | 20 years, 7 %, 20 % | the live opening values and labels; CD-26's arithmetic fix stays |
| 42 | Agent card: Avatar, "Speak to Alex", "Broker License No. 0007755", "Leave your details below and Alex will be in touch with you within 24 hours" | generic heading | Site Settings → Listing agent (defaults = live copy; photo in Media) |

Data, not build: ZTP815's Features, Location map and gallery are empty here because the recorded corpus has no detail payload for it (73 of 513); the similar grid shows 4 (the block's `property_per_page` is 4) where production had only 3 matches.

---

## 5. Golden-master seeding (FR-PY03, FR-PY07)

The corpus is ready to use as fixtures:

| Suite | Available now | Source |
|---|---|---|
| `GM-SEARCH` | **1,381** real request/response pairs, spanning 4 sort modes, indexed multi-facet selections and 41 price-filtered queries | `wp_curl_info` where `ws_name='properties'` |
| `GM-PAGE` | **125** listing detail responses | `ws_name='properties/view'` |
| `GM-FILTER` | **40** filter calls | `ws_name='properties/filter_property'` |
| `GM-CALC` | 30 vectors to be **generated** from BPM-001 | Formula is exact, so expected values compute offline |
| `GM-TAX` | Full taxonomy dump | `wp_terms` / `wp_term_taxonomy` |

Every one of these replays without CRM credentials and without network access.

---

## 6. Sign-off

| Role | Name | Rules signed | Date |
|---|---|---|---|
| Tech lead (capture) | | | |
| Client (parity approval) | Alex Zeta / Zeta Group | | |

**Blocked rows:** BPM-001 (CD-07), BPM-009 (needs a scope decision, not a signature).

---

## 7. Session 3 findings — 29 Oct 2026 (build start)

Found while building the CRM adapter and search layer against the extracted corpus. Each is **Extracted + corroborated** unless marked. None is signed yet.

| # | Finding | Evidence | Effect |
|---|---|---|---|
| S3-1 | **`fa[]=a{n}` selects a CRM *attribute* value id**, not a feature. `a131` = "Golf Course" (Views), matching the golf-course draft shortlist; `a142` = "Is Foreclosed? No", so Foreclosed's `a143` is almost certainly "Yes" | `properties/view` `attributes` blocks, 73 fixtures | BPM-012 semantics confirmed. Listings now mirror attribute ids |
| S3-2 | **CD-13 is half-answered.** Sub-type `7` is **Commercial** in every CRM payload, so the *Commercial* shortlist is correct and *Beachfront* is the broken clone. Attribute **`145` = "Beachfront"** exists, so the intended query was very likely `fa[]=a145` | `property_sub_type_id`/`property_sub_name` pairs; `attributes` | OQ-22 becomes a yes/no for the client: *"Should Beachfront be `fa[]=a145`?"* |
| S3-3 | **`area[]=city_{id}` is a CRM `town_id`**, `area[]=municipality_{id}` a `municipality_id`; the plugin forwards them as `city[]` / `municipality[]`. `type[]=_st_{n}` is forwarded as `sub_property_type[]={n}` | 686 and 464 corpus calls; replayed in `tests/parity/search.parity.test.ts` | Search translation is now golden-master tested |
| S3-4 | **BPM-003 refinement.** PHP's `$_GET` decodes a raw `+` to a space, so the "drop the ceiling" branch only fires when the slider sends `%2B`. A raw `+` keeps the ceiling | `search-results.php:590`; PHP query-string semantics | The live slider check must record the *encoding*, not just the value |
| S3-5 | **An empty display currency renders no price**: `!empty($currency_converter->{""})` fails before any branch | `functions.php:8926` | Reproduced |
| S3-6 | List responses carry sub-type and sale-type **labels only**; ids come from `properties/view`. `sale_detail_type` "New Development" = id `2` (what BPM-012 calls Preselling). `property_for_id=3` occurs twice, unlabelled | Fixtures | Mirror stores ids as text, not selects |
| S3-7 | **Respacio auth**: `x-api-key: {property_verification_key}` plus the fixed vendor `Basic admin:1234` on every call (TF-01 confirmed) | `functions.php:110–120` | Live sync needs only the key |

