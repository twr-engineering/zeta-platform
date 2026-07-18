import type { DealType, Representation, TransactionType } from "@/lib/engine";

/**
 * M2.1 — the segment classifier, the ONE source of truth for segment membership
 * (PRD §3.2 / FR-M2-02). Aggregation, the partition invariant, and any future
 * per-deal "segment" badge (M9 facet) all call `classifySegment` — the COUNTIFS
 * criteria live in exactly one place, unit-tested against all 21 workbook deals.
 *
 * PURE, decimal-free (segment membership is a function of three enum fields only),
 * string/enum in — mirrors the M1 engine's narrow, side-effect-free contract so
 * this library is shared server-side with M1 and testable with zero I/O.
 */

/** The four mutually-exclusive segments a deal can belong to (PRD §3.2). */
export type Segment = "resale" | "developer" | "rental" | "referral";

/**
 * The minimal deal projection M2 reads (PRD §3.1 field-level contract). Money is
 * carried as the stored, centavo-rounded `numeric(14,2)` ::text string exactly as
 * M1 persisted it (Rule 8 — M2 sums what is stored, never re-derives); enums are
 * the shared M1 engine tokens.
 *
 * M2.2's server loader maps a DB deal row to this shape — the same decoupling
 * sections.ts uses with ProjectionReceivable — bridging deal_type `n_a`→`n/a` with
 * the existing map.ts `dealTypeToEngine`. `n/a` never reaches a positive predicate
 * here (rentals classify on transaction_type), so the token spelling is immaterial
 * to classification.
 *
 * NOTE (OQ2 — Cancelled deals). M2 is a booked-basis read model: it carries NO M4
 * collection status at all, so `Cancelled` deals are INCLUDED by construction, per
 * sheet parity (PRD Rule 1 / OQ2). Adding a status filter here is the ONLY change
 * that would alter the frozen §9 fixtures — do not add one without owner sign-off.
 */
export type YieldDeal = {
  /** Stable deal code (e.g. "D021") — surfaced when the partition invariant fails. */
  deal_code: string;
  transaction_type: TransactionType;
  deal_type: DealType;
  representation: Representation;
  /** Col M — property price; for a rental this holds the ANNUAL RENT (PRD §3.1). */
  list_price: string;
  /** Col AD — NET GCI, Net of VAT (M1 Rule H). */
  net_gci: string;
  /** Col Z — developer bonus net; memo "Incentives (+)". */
  incentive_net: string;
  /** Col AC — referral fee paid out; memo "Referral-outs (−)". */
  referral_out: string;
  booked_year: number;
  /** Archived deals are excluded from every aggregate the moment this is set. */
  archived_at: string | null;
};

/** The three fields classification actually reads — so a badge caller need not carry money. */
export type ClassifiableDeal = Pick<
  YieldDeal,
  "transaction_type" | "deal_type" | "representation"
>;

/**
 * Map a deal to its segment, or `null` when it matches none (PRD §3.2).
 *
 * Order encodes the predicates' precedence exactly:
 *  1. representation = Referrer ⇒ Referral, for ANY transaction type — a Referrer
 *     deal appears ONLY here and can never move the sales blend (PRD Rule 2).
 *  2. otherwise Rental = transaction_type Rental (deal_type is N/A by M1 coupling).
 *  3. otherwise a Sale splits by deal_type into Resale / Developer.
 *
 * `null` is a Rule 9 signal, never a silent drop: a Sale with deal_type N/A and a
 * non-Referrer role (only reachable via imported/legacy data that broke M1's
 * type coupling) is surfaced as a data-quality warning by `unclassifiedDealCodes`.
 * SALES SUBTOTAL is deliberately NOT a return value — it is Resale+Developer,
 * derived in the report, not a predicate (PRD §3.2).
 */
export function classifySegment(deal: ClassifiableDeal): Segment | null {
  if (deal.representation === "referrer") return "referral";
  if (deal.transaction_type === "rental") return "rental";
  if (deal.transaction_type === "sale") {
    if (deal.deal_type === "resale") return "resale";
    if (deal.deal_type === "developer") return "developer";
  }
  return null;
}

/** True for deals that count toward the sales blend / planning basis (PRD §3.2). */
export function isSalesSegment(segment: Segment | null): boolean {
  return segment === "resale" || segment === "developer";
}

/**
 * The Rule 9 partition invariant, as data (never throws): the deal codes of the
 * non-archived deals that fall out of all four segments. An EMPTY array means the
 * four predicates partition the population — count(Resale)+count(Developer)+
 * count(Rental)+count(Referral) = count(non-archived). The report and the M2.2
 * reconciliation pass both surface this list so an unclassified deal is impossible
 * to miss, the way COUNTIFS silently drops it in the sheet.
 */
export function unclassifiedDealCodes(deals: readonly YieldDeal[]): string[] {
  return deals
    .filter((d) => d.archived_at === null && classifySegment(d) === null)
    .map((d) => d.deal_code);
}
