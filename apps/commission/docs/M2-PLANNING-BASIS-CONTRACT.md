# PlanningBasis API — the M2 → M3 contract

> The single most important external surface M2 exposes. M3's GCI Calculator runs
> on the two numbers below on every render. This document is the contract; the
> shape is frozen — additive changes only (BACKWARDS-COMPAT.md).

**Source of truth:** M2 PRD §3.4 · FR-M2-03 · NFR §8 (<50 ms P95) · Rule 7 (full precision).
**Implementation:** `src/lib/yield/contract.ts` (shape + mapper) · `src/lib/yield/planning-basis.ts` (server read) · `src/app/api/yield/planning-basis/route.ts` (HTTP).

---

## How M3 consumes it

**Preferred — import the server function directly** (no HTTP hop, no JSON boundary,
zero float risk):

```ts
import { getPlanningBasis } from "@/lib/yield/planning-basis";

const basis = await getPlanningBasis(); // RLS-scoped to the caller's workspace
```

**HTTP (demo / debug / non-Next consumers):**

```
GET /api/yield/planning-basis        → 200 { …contract… }   (auth required)
                                        401 { error }        (no session)
```

Both return the identical `PlanningBasisContract`. M3 uses `all_time_yield` and
`all_time_price` wherever its per-year Yield / Avg-Price overrides are blank
(PRD §7). M2's feed to M3 is *exactly* these two numbers — M3's YTD Actual Sales
reads M1 directly, not through here.

---

## The shape

```ts
type PlanningBasisContract = {
  all_time_yield:        string | null; // gci ÷ volume, FULL precision; null when volume = 0
  all_time_price:        string | null; // volume ÷ deals, FULL precision; null when deals = 0
  all_time_sales_deals:  number;        // count of non-archived Resale+Developer deals; 0 when none
  all_time_sales_volume: string;        // Σ list_price, 2 dp; "0.00" when none
  all_time_sales_gci:    string;        // Σ net_gci, 2 dp; "0.00" when none
  basis_version:         number;        // monotonic cache token; 0 before first sales basis
  computed_at:           string | null; // ISO stamp of last change; null before first
};
```

### Live value (the v30.20 workbook)

| Field | Value |
|---|---|
| `all_time_yield` | `"0.04073618002454719238387240859"` (→ display 4.0736%) |
| `all_time_price` | `"9369467.352941176470588235294"` (→ display ₱9,369,467.35) |
| `all_time_sales_deals` | `17` |
| `all_time_sales_volume` | `"159280945.00"` |
| `all_time_sales_gci` | `"6488497.25"` |
| `basis_version` | `1` (established on import) |
| `computed_at` | ISO timestamp of the import drain |

---

## Precision guarantee (Rule 7 — do not break)

`all_time_yield` and `all_time_price` cross the wire as **full-precision decimal
strings**, never JSON numbers. This is load-bearing:

**Cross-check identity:** `all_time_yield × all_time_price = all_time_sales_gci ÷ all_time_sales_deals = ₱381,676.31`
— exactly M3's verified *Professional Fees per deal*.

- With full precision: `0.04073618… × 9369467.35… = 381,676.31` ✓
- With the display-rounded yield (4.0736%): `0.040736 × 9,369,467.35 = 381,674.62` ✗ (₱1.69 off)

A JSON number is an IEEE-754 float and would silently reintroduce that error, so
the two ratios are **strings**. `all_time_sales_deals` and `basis_version` are the
only JSON numbers — integer counts with no precision to lose. Consumers must do
decimal arithmetic on the ratio strings (the app uses `decimal.js` via
`@/lib/money`), never `parseFloat` into the money path.

Proven in CI: `tests/unit/yield/planning-basis.test.ts` (the identity through this
exact contract mapper) and end-to-end against live Postgres in
`scripts/live-m23-check.mts`.

---

## Null semantics

Nulls carry "no realized sales basis" — **never** an error, never a zero-as-number
that would divide wrong downstream (PRD criterion 11):

| State | `all_time_yield` | `all_time_price` | deals / volume / gci | `basis_version` |
|---|---|---|---|---|
| Has sales | full-precision string | full-precision string | real values | ≥ 1 |
| No sales deals (volume = 0) | `null` | `null` | `0` / `"0.00"` / `"0.00"` | 0, or ≥ 1 if sales existed then were archived |

M3 renders its *"no realized basis yet"* state when either ratio is `null`.

---

## Version semantics (cache coherence)

`basis_version` is a **per-workspace monotonic counter**. The database
(`consume_yield_events`) bumps it whenever a **Sales-segment (Resale/Developer)
cell changes value** — created, edited, archived, or restored. It is M3's cache
key:

- Starts at `0` — "no realized sales basis has ever been established."
- First sales deal → `1`; every subsequent sales change → `+1`. **Monotonic up**,
  never reused, never decremented (a restore that returns to a prior state still
  advances the counter — the token tracks *events*, not value-equality).
- **Always present** (even for an empty workspace), so M3 never special-cases a
  missing version. `computed_at` is `null` until the first bump.

**Invalidation rule for M3:** cache the basis keyed by `basis_version`. On each
render, cheap-read the version; if it advanced, refetch. The read is compute-on-read
(see below), so a stale token is impossible — the version and the numbers are always
read from the same live snapshot.

Rentals and Referral deals do **not** move `basis_version` (they are outside the
sales blend, Rules 2/3), so M3's cache is not churned by non-sales activity.

---

## Performance & caching decision

**NFR:** < 50 ms P95 (M3 reads it on every calculator render).

**Decision: compute-on-read, no cache layer.** The read is two tiny indexed queries
run in parallel — the materialized `yield_aggregate` cells (≤ segments × years, a
couple dozen rows even at 1,000 deals) and the single `yield_basis_version` row.

The §3.5/NFR line suggests "cached, invalidated by basis_version"; we measured and
chose against it, for two reasons:

1. **M6.1 precedent.** The far heavier 8-section dashboard read measured 22 ms
   server P95 and documented that a cache would "only add invalidation complexity
   for no benefit." This read is lighter.
2. **Correctness.** `basis_version` *is* the coherence token and must be read live.
   A cache over the cells could serve M3 a **new version alongside old numbers** if
   any invalidation seam were missed — the worst failure for a cache-coherence token
   (M3 would pin stale numbers under the fresh token and never refresh). Reading both
   live keeps them consistent by construction.

Measured live: see `scripts/live-m23-check.mts` (P95 over ~50 calls, reported at the
end of the run). If a future data shape pushes this past budget, the cache path is a
localized change in `planning-basis.ts` — the contract does not change.

---

## Tenancy (AC9)

`getPlanningBasis()` takes **no `workspaceId`** — both reads are RLS-scoped to the
caller's workspace, exactly like every other M2 read. The HTTP route authenticates
via `getWorkspaceContext()` (revalidates the JWT) before reading. A workspace can
only ever see its own basis; there is no id in the URL or the function signature to
tamper with.

---

## Consumer test double

M3's unit tests import the typed fake instead of a database:

```ts
import {
  WORKBOOK_PLANNING_BASIS,            // the ₱381,676.31 identity fixture
  WORKBOOK_PLANNING_BASIS_D021_ARCHIVED, // criterion 8 (16 deals, version 2)
  EMPTY_PLANNING_BASIS,               // criterion 11 (nulls, version present)
  makePlanningBasis,                  // override-based builder for edge cases
} from "tests/doubles/planning-basis";
```

The doubles are pinned to reality by `tests/unit/yield/planning-basis.test.ts`,
which rebuilds them through the real mapper and asserts byte-equality — they can
never silently drift from what the API emits.

**DoD anchor:** an M3 stub renders `16,920,000 ÷ 381,676.31 = 44.33` deals needed,
end-to-end from `WORKBOOK_PLANNING_BASIS`.
