import { toMoney, ZERO, type MoneyValue } from "@/lib/money";
import type { ProjectionReceivable } from "@/lib/receivables/projections";

/**
 * M7.1 — Source Performance aggregation (the lead-channel scorecard). PURE
 * functions over the M4 receivable rows the read layer already loaded (a
 * `ReceivableRow` satisfies `ProjectionReceivable`): no database, no `today`, no
 * formatting. Every peso figure is summed at FULL precision through the Money
 * (decimal) type and rounded to centavos only at the boundary (`toFixed`); every
 * ratio is computed from the full-precision aggregates and carried at 6 dp so a
 * 4-dp percent renders exactly (PRD §4 rule 9 — never sum the display-rounded
 * per-deal values, that drifts a centavo over YouTube's outstanding).
 *
 * WHY A DEDICATED MODULE (not receivables/projections.perSourceRollups). The
 * generic M4.4 per-source rollup covers only six of the eleven §3.3 columns and,
 * critically, divides % Collected by Total Collectible. M7 §3.3 col 7 / OQ4
 * divides by **Booked NET GCI** — the divergence that makes the Referral row read
 * 109.38% (875,000 ÷ 800,000), not the 100% a collectible denominator would give.
 * M7 also needs the % of NET GCI / Avg / Resale+Rental Outstanding columns and the
 * source-visibility rules (zero-deal actives shown, zero-deal archived hidden,
 * archived-with-deals labelled "(inactive)"), which require the M0 lead-source
 * master list, not just the receivables. Keeping it here isolates the M7 semantics
 * and, per FR-M7-03, the Collected NET definition (see `collectedNetForSource`).
 *
 * NO tax math lives here: these are sums, differences and ratios of figures M1/M4
 * already computed and stored.
 */

// --- small helpers ----------------------------------------------------------

/** Full-precision sum of a money accessor over rows, rounded to centavos once. */
function sumMoney<T>(rows: readonly T[], get: (row: T) => string | null): string {
  return rows
    .reduce<MoneyValue>((acc, row) => {
      const v = get(row);
      return v === null ? acc : acc.plus(toMoney(v));
    }, ZERO)
    .toFixed(2);
}

/**
 * numer ÷ denom as an exact 6-dp rate string, or null when denom = 0. Never
 * capped: % Collected legitimately exceeds 1.0 when referral-out cash passes
 * through a source (PRD §4 rule 8 — Referral's 1.093750).
 */
function ratio(numer: string, denom: string): string | null {
  const d = toMoney(denom);
  if (d.isZero()) return null;
  return toMoney(numer).dividedBy(d).toFixed(6);
}

/** total ÷ count as a centavo string, or null when count = 0 (a zero-deal row). */
function avg(total: string, count: number): string | null {
  if (count === 0) return null;
  return toMoney(total).dividedBy(count).toFixed(2);
}

/** Only the non-archived receivables take part (§4 rule 16 — an archived DEAL drops out). */
function active(rows: readonly ProjectionReceivable[]): ProjectionReceivable[] {
  return rows.filter((r) => r.archived_at === null);
}

/** An open receivable still owing money — the outstanding-balance view membership. */
function isOpenWithBalance(r: ProjectionReceivable): boolean {
  return r.status === "open" && r.balance !== null && toMoney(r.balance).greaterThan(0);
}

/** deal_type ≠ developer ⇒ the fast bucket (resale closes + rentals pay quickly). */
function isFastBucket(r: ProjectionReceivable): boolean {
  return r.deal_type !== "developer";
}

// --- FR-M7-03: the isolated Collected NET definition ------------------------

/**
 * **FR-M7-03 / PRD §4 rule 7 / Open Question 1.** Collected NET for a source =
 * `Σ receivable.collected_net` — the actual cash that arrived, on a Net-of-VAT
 * basis (EWT withheld still counts; it returns as a tax credit). This is the SPEC
 * DEFAULT and a DELIBERATE divergence from the v30.20 sheet, which derives
 * Collected = `Booked − Outstanding` (col F = C − H). That derivation is wrong on
 * receivable overrides and cancelled-with-partial-collection rows because `balance`
 * is kept against Total Collectible while Booked is NET GCI — the two share a ₱ unit
 * but not a base. Worked divergence (D004 / Referral): booked NET 800,000, actual
 * cash 875,000, outstanding 0 → the sheet gives 800,000 − 0 = ₱800,000; the honest
 * figure is ₱875,000.
 *
 * This ONE function is the entire surface of Open Question 1. Should the product
 * owner reverse the decision to the sheet's derivation, replace the body with
 * `Σ (booked_net_gci − open balance)` here and nowhere else — every column, TOTAL,
 * and % Collected recompute from it.
 */
export function collectedNetForSource(rows: readonly ProjectionReceivable[]): string {
  return sumMoney(rows, (r) => r.collected_net);
}

// --- the eleven §3.3 columns ------------------------------------------------

/** The computed measures of a Source Performance row (cols 2–11 of PRD §3.3). */
export type SourceMetrics = {
  /** col 2 — count of in-scope receivables for this source. */
  deals: number;
  /** col 3 — Σ booked_net_gci (the earned NET GCI). */
  bookedNetGci: string;
  /** col 4 — Booked(source) ÷ Booked(TOTAL), 6-dp rate; null when TOTAL booked = 0. */
  pctOfNetGci: string | null;
  /** col 5 — Booked ÷ Deals; null on a zero-deal row. */
  avgNetGciPerDeal: string | null;
  /** col 6 — Σ collected_net (FR-M7-03; see collectedNetForSource). */
  collectedNet: string;
  /** col 7 — Collected ÷ Booked (OQ4 denominator = Booked), 6-dp; may exceed 1.0; null when Booked = 0. */
  pctCollected: string | null;
  /** col 8 — Σ balance over OPEN rows (what is still owed). */
  outstandingNet: string;
  /** col 9 — Σ booked_net_gci where deal_type ≠ developer (fast money). */
  resaleRentalNetGci: string;
  /** col 10 — Σ open balance where deal_type ≠ developer. */
  resaleRentalOutstanding: string;
  /** col 11 — Σ booked_net_gci where deal_type = developer (slow pipeline money). */
  developerNetGci: string;
};

/** A Source Performance row: the source label + its measures (PRD §3.3). */
export type SourcePerformanceRow = SourceMetrics & {
  leadSourceId: string;
  /** col 1 — LeadSource.name, with " (inactive)" appended when archived. */
  source: string;
  /** True when the source is archived (drives the "(inactive)" badge in M7.2). */
  archived: boolean;
};

/** The TOTAL row — same measures, summed / recomputed per §3.5 (source label is "TOTAL"). */
export type SourcePerformanceTotal = SourceMetrics;

export type SourcePerformanceReport = {
  /** The applied filter, echoed back for the UI/export header. */
  year: number | "all";
  /** Source rows, Booked NET GCI descending (§4 rule 10), ties by lead-source order. */
  rows: SourcePerformanceRow[];
  /** The pinned TOTAL row (§3.5): counts/₱ summed, % Collected & Avg recomputed. */
  total: SourcePerformanceTotal;
};

/** The M0 lead-source fields M7 reads: identity, label, archive state, list order. */
export type SourceLeadSource = {
  id: string;
  name: string;
  archived_at: string | null;
  sort_order: number;
};

/**
 * Compute the eleven columns for a set of receivables. `totalBooked` is the whole
 * report's Booked NET GCI — the % of NET GCI denominator — passed in so a source
 * row and the TOTAL row (which passes its own booked as the denominator, yielding
 * 100.00% by construction, §3.5) share one code path. All ratios divide the
 * full-precision aggregates, never the display-rounded per-row values (§4 rule 9).
 */
function metricsFor(
  group: readonly ProjectionReceivable[],
  totalBooked: string
): SourceMetrics {
  const bookedNetGci = sumMoney(group, (r) => r.booked_net_gci);
  const collectedNet = collectedNetForSource(group);
  const open = group.filter(isOpenWithBalance);
  const fast = group.filter(isFastBucket);
  const dev = group.filter((r) => !isFastBucket(r));

  return {
    deals: group.length,
    bookedNetGci,
    pctOfNetGci: ratio(bookedNetGci, totalBooked),
    avgNetGciPerDeal: avg(bookedNetGci, group.length),
    collectedNet,
    pctCollected: ratio(collectedNet, bookedNetGci),
    outstandingNet: sumMoney(open, (r) => r.balance),
    resaleRentalNetGci: sumMoney(fast, (r) => r.booked_net_gci),
    resaleRentalOutstanding: sumMoney(
      open.filter(isFastBucket),
      (r) => r.balance
    ),
    developerNetGci: sumMoney(dev, (r) => r.booked_net_gci),
  };
}

/** Archived sources render "Name (inactive)"; active sources render bare (§4 rule 2). */
function sourceLabel(source: SourceLeadSource): string {
  return source.archived_at === null ? source.name : `${source.name} (inactive)`;
}

/**
 * The Source Performance report (PRD §3.3–3.5): one row per VISIBLE lead source
 * plus the TOTAL row, for a workspace's receivables filtered to `year` (a booking
 * year or "all"). Visibility (§4 rules 2–3):
 *   - a source with ≥1 in-scope deal ALWAYS reports (active or archived → "(inactive)");
 *   - an ACTIVE source with 0 in-scope deals reports as a row of zeros (a finding,
 *     not noise — a channel producing nothing);
 *   - an ARCHIVED source with 0 in-scope deals is hidden.
 * A referenced source can never orphan a deal's NET GCI: any lead_source_id present
 * on an in-scope receivable but missing from `leadSources` (defensive — M0 archives,
 * never deletes) still gets a row, labelled by its id.
 *
 * `year` compares deal.booked_year (booking year) — NEVER the payment year (§4 rule
 * 1): money collected in 2028 against a 2026 deal stays in the 2026 row.
 *
 * Rows are ordered Booked NET GCI descending (§4 rule 10, the scorecard reading
 * order), ties broken by the lead-source list order (the sheet's Settings order);
 * the TOTAL row is returned separately for the UI to pin last.
 */
export function sourcePerformance(
  receivables: readonly ProjectionReceivable[],
  leadSources: readonly SourceLeadSource[],
  year: number | "all"
): SourcePerformanceReport {
  const inScope = active(receivables).filter(
    (r) => year === "all" || r.booked_year === year
  );
  const totalBooked = sumMoney(inScope, (r) => r.booked_net_gci);

  // Group the in-scope receivables by their source.
  const groups = new Map<string, ProjectionReceivable[]>();
  for (const r of inScope) {
    const bucket = groups.get(r.lead_source_id);
    if (bucket) bucket.push(r);
    else groups.set(r.lead_source_id, [r]);
  }

  // Rank each source's list position so equal-Booked rows keep the sheet's order,
  // and an unmapped (defensive) source id sinks below the configured ones.
  const order = new Map<string, number>();
  leadSources.forEach((s, i) => order.set(s.id, i));
  const orderOf = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;

  const rows: SourcePerformanceRow[] = [];

  for (const source of leadSources) {
    const group = groups.get(source.id) ?? [];
    // §4 rule 3: hide an archived source only when it has no in-scope deals.
    if (group.length === 0 && source.archived_at !== null) continue;
    rows.push({
      leadSourceId: source.id,
      source: sourceLabel(source),
      archived: source.archived_at !== null,
      ...metricsFor(group, totalBooked),
    });
  }

  // Never-orphan safety: a referenced source missing from the master list.
  for (const [leadSourceId, group] of groups) {
    if (order.has(leadSourceId)) continue;
    rows.push({
      leadSourceId,
      source: leadSourceId,
      archived: false,
      ...metricsFor(group, totalBooked),
    });
  }

  rows.sort((a, b) => {
    const cmp = toMoney(b.bookedNetGci).comparedTo(toMoney(a.bookedNetGci));
    if (cmp !== 0) return cmp;
    return orderOf(a.leadSourceId) - orderOf(b.leadSourceId);
  });

  // §3.5 — the TOTAL row shares metricsFor: its Booked IS the denominator, so % of
  // NET GCI = 100.00% by construction, Avg = Booked(TOTAL) ÷ Deals(TOTAL), and %
  // Collected = Collected(TOTAL) ÷ Booked(TOTAL) (recomputed from totals, never the
  // average of the row percentages).
  const total = metricsFor(inScope, totalBooked);

  return { year, rows, total };
}

/**
 * FR-M7-02 — the distinct booking years present in the workspace's receivables,
 * newest first. The M7.2 year filter offers `All` plus exactly these (never a year
 * with no booked deal). Over active receivables only, mirroring the report's scope.
 */
export function distinctBookedYears(
  receivables: readonly ProjectionReceivable[]
): number[] {
  const years = new Set<number>();
  for (const r of active(receivables)) years.add(r.booked_year);
  return [...years].sort((a, b) => b - a);
}
