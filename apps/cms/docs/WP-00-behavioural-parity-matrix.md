# WP-00 — Behavioural Parity Matrix

| Field | Value |
|---|---|
| **Document** | Behavioural Parity Matrix (PRD Appendix G, produced in full) |
| **Project** | Zeta Group Property Portal — replatform to Payload CMS 3 + Next.js |
| **Governs** | PRD v2.1 §GP.2, GP.3, GP.4 (FR-PY01, FR-PY02, FR-PY08) |
| **Date** | 22 August 2026 |
| **Status** | **Session 2 — live sweep complete.** 13 rules captured (**BPM-001 verified against production**), 11 outstanding, 5 defects live (2 withdrawn, 3 new). See §4 |
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

**CD-11 is the one to look at hardest.** Arbitrary user-controlled strings are reaching a third-party API in a parameter that names a sort column. It is at minimum a correctness bug and potentially an injection surface on the CRM side. It should be reported to Respacio regardless of what this project does.

---

## 4. Outstanding — 11 rules not yet captured

Honest status. Each has a named source; none is blocked on anything external.

| Requirement | What is still needed | Source to read |
|---|---|---|
| FR-L02, FR-L03 | Module set, order and data source for city vs barangay templates | `templates`/`customtemplates` records; `respacio_location_tree` postmeta (472 rows) |
| FR-D01, FR-D04, FR-P01, FR-P02, FR-P10 | **Transcription only** — the 113-field + 24-collection inventory is already measured (PRD DG-02). Needs writing into rows, with per-field render/no-render status from the DSL | `wp_curl_info` `properties/view`; template records |
| FR-A04, FR-A10 | Whether email verification is enforced; the account-area feature set | `functions.php:823–920`; `my-account` page body; `contacts/*` |
| **FR-A13** | The rule behind *"Please sign up to see your recommendation"* | `functions.php`; `contacts/check_contact`; `my-account` |
| FR-F02, F03, F04, F06 | Field names, order, labels, required flags, validation, consent wording, recipient routing | The 89 `wpcf7_contact_form` records — **blocked on OQ-17**, which subset is live |
| FR-E04, FR-E05 | Article template field set; block census across post bodies | `wp_posts` type `post` |
| FR-E20 | Directory filter semantics | `includes/cpt-directory.php`; `respacio-blocks/infinity-directory-grid` |

Two rows moved out of this list this session — FR-SL02 is fully captured (BPM-012), and FR-E02 is now a precisely-located conflict rather than an unknown (BPM-013).

**Estimate to close:** roughly one more session for everything except FR-F02–F06, which cannot start until the client answers OQ-17.

### 4.1 Live check sweep — results

Run 22 August 2026 against production via Playwright. Four items closed, two still outstanding, two newly blocked on the client.

| Check | Resolves | Status |
|---|---|---|
| ~~Count the Insights index and its last page number~~ | BPM-013 / FR-E02 | ✅ **Done** — 6/page, 12 pages, `?pageid=n`, AJAX, canonical collapse |
| ~~Click "See Qualified Properties" after a calculation~~ | CD-07 | ✅ **Done** — works. Defect withdrawn |
| ~~Verify the calculator formula end-to-end~~ | BPM-001 | ✅ **Done** — exact to the centavo. `GM-CALC-001` |
| ~~Load `/buy/` logged out~~ | CD-08 | ⚠️ **Half done** — logged-out confirmed; **needs a logged-in comparison** |
| Exercise the price slider at its top stop; capture the outbound request | BPM-003 — the `+` semantics | ⬜ Outstanding |
| Submit a banded facet with an open-ended top band; confirm whether `max_X=0` means "no ceiling" or "zero" | BPM-005 | ⬜ Outstanding |
| Fetch one sold/withdrawn reference number | BPM-007 / FR-P11 | ⬜ **Blocked** — needs a sold reference number from the client |
| Does `?amount=` actually filter the search? | BPM-001 follow-on | ⬜ **Inconclusive** — the A/B was confounded by CD-15's JS bootstrap and by per-query-string page caching. Retest with JS enabled on both variants |

**Two credentials-blocked items** now gate the rest: a staff login (CD-08) and one sold reference number (FR-P11). Both are one-line asks to the client.

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

