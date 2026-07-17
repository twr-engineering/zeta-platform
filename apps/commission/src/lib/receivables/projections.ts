import { toMoney, ZERO, type MoneyValue } from "@/lib/money";
import { compareChasePriority } from "./idle";
import type { Receivable } from "@/types/entities";

/**
 * M4.4 downstream projections (FR-M4-10/11/13) — the typed read shapes M6/M7/M8/M9
 * consume off the receivable ledger. Everything here is a PURE function over a set
 * of receivable rows: no database, no `today` (idle/age arrive already overlaid on
 * the row by the read layer — src/lib/receivables/queries.ts), no formatting. That
 * makes every aggregate unit-testable against the workbook fixture and, crucially,
 * makes the reconciliation the module lives or dies on assertable:
 *
 *   Σ aging balance      == Σ open balance (outstanding)
 *   Σ per-developer Σ    == the position totals
 *   Σ per-source Σ       == the position totals
 *   Σ booking-year rows  == the position totals
 *
 * MONEY DISCIPLINE (Master PRD §4.3). Every peso figure is summed at FULL precision
 * through the Money (decimal) type from its stored ::text string, and only rounded
 * to centavos at the boundary (`toFixed(2)`). Summing the already-rounded 2-dp
 * displays would drift a centavo over 1,000 rows — the same rule that forces the
 * engine's default_total_collectible to be computed from full-precision components.
 * NO tax math lives here: these are sums and differences of figures the engine and
 * the M4.2/M4.3 consumers already computed.
 *
 * The server-side wrappers (getPositionTotals, getAgingRows, …) load the rows once
 * via listReceivables (which overlays live months_idle/age_months and joins the
 * developer name) and hand them to these pure functions. Closed/Cancelled rows are
 * excluded from every OPEN-balance view (aging, chase) by the `status = 'open'`
 * filter the pure functions apply; they still count toward position/collected
 * totals, per §4 rules 8–10.
 */

/**
 * The receivable shape the projections read. A full `ReceivableRow` (Receivable +
 * joined developer) satisfies it; a test can build a partial with `as`. idle/age
 * are the LIVE values the read layer overlaid — never the stored DB columns.
 */
export type ProjectionReceivable = Pick<
  Receivable,
  | "deal_id"
  | "deal_code"
  | "client_name"
  | "property_details"
  | "deal_type"
  | "developer_id"
  | "lead_source_id"
  | "booked_year"
  | "status"
  | "booked_net_gci"
  | "total_collectible"
  | "collected_net"
  | "balance"
  | "variance"
  | "written_off"
  | "pct_collected"
  | "last_payment_date"
  | "months_idle"
  | "age_months"
  | "days_to_first_release"
  | "confirmed_collectible"
  | "next_action_note"
  | "archived_at"
> & { developer: { name: string } | null };

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

/** collected ÷ collectible as an exact rate string, or null when collectible = 0. */
function pct(collected: string, collectible: string): string | null {
  const denom = toMoney(collectible);
  if (denom.isZero()) return null;
  return toMoney(collected).dividedBy(denom).toFixed(6);
}

/** Only the non-archived rows take part in every projection (§4 rule 16). */
function active<T extends { archived_at: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.archived_at === null);
}

/** An open, non-archived row still owing money (open-balance view membership). */
function isOpenWithBalance(r: ProjectionReceivable): boolean {
  return r.status === "open" && r.balance !== null && toMoney(r.balance).greaterThan(0);
}

// --- (a) position totals (M6 §1) --------------------------------------------

export type PositionTotals = {
  /** Σ total_collectible over every active receivable (all statuses). */
  totalCollectible: string;
  /** Σ collected_net over every active receivable (all statuses; §4 rule 10). */
  collectedNet: string;
  /** Σ balance over OPEN rows — the outstanding the aging/chase views share. */
  balanceOutstanding: string;
  /** Σ written_off over Cancelled rows (Rule O; cash kept elsewhere). */
  writtenOff: string;
  /** Σ variance over Closed rows (Rule N; realized short/over). */
  varianceRealized: string;
  /** Σ booked_net_gci over every active receivable (the earnings anchor). */
  bookedNetGci: string;
  /** collectedNet ÷ totalCollectible, or null when nothing is collectible. */
  pctCollected: string | null;
  /** How many active receivables in each status. */
  counts: { open: number; closed: number; cancelled: number };
};

export function positionTotals(all: readonly ProjectionReceivable[]): PositionTotals {
  const rows = active(all);
  const open = rows.filter((r) => r.status === "open");
  const totalCollectible = sumMoney(rows, (r) => r.total_collectible);
  const collectedNet = sumMoney(rows, (r) => r.collected_net);

  return {
    totalCollectible,
    collectedNet,
    balanceOutstanding: sumMoney(open, (r) => r.balance),
    writtenOff: sumMoney(
      rows.filter((r) => r.status === "cancelled"),
      (r) => r.written_off
    ),
    varianceRealized: sumMoney(
      rows.filter((r) => r.status === "closed"),
      (r) => r.variance
    ),
    bookedNetGci: sumMoney(rows, (r) => r.booked_net_gci),
    pctCollected: pct(collectedNet, totalCollectible),
    counts: {
      open: open.length,
      closed: rows.filter((r) => r.status === "closed").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
    },
  };
}

// --- (b) aging of open balances (M6 §4) -------------------------------------

/** The four aging buckets by age_months: [0,1), [1,3), [3,6), [6,∞). */
export type AgingBucketKey = "lt1" | "m1to3" | "m3to6" | "m6plus";

export type AgingBucket = {
  key: AgingBucketKey;
  label: string;
  count: number;
  balance: string;
  /** This bucket's balance ÷ the total outstanding, or null when nothing is due. */
  shareOfOutstanding: string | null;
};

export type Aging = {
  buckets: AgingBucket[];
  /** Ties to positionTotals.balanceOutstanding (over open rows with balance > 0). */
  totalBalance: string;
};

const AGING_LABELS: Record<AgingBucketKey, string> = {
  lt1: "< 1 month",
  m1to3: "1–3 months",
  m3to6: "3–6 months",
  m6plus: "6+ months",
};

function agingBucketOf(ageMonths: number): AgingBucketKey {
  if (ageMonths < 1) return "lt1";
  if (ageMonths < 3) return "m1to3";
  if (ageMonths < 6) return "m3to6";
  return "m6plus";
}

/**
 * Aging buckets over open receivables with balance > 0, keyed on the LIVE
 * age_months the read layer overlaid (falls back to booking date so a never-paid
 * receivable still ages). The bucket total ties to the outstanding balance.
 */
export function agingRows(all: readonly ProjectionReceivable[]): Aging {
  const rows = active(all).filter(isOpenWithBalance);
  const totalBalance = sumMoney(rows, (r) => r.balance);
  const denom = toMoney(totalBalance);

  const buckets = (Object.keys(AGING_LABELS) as AgingBucketKey[]).map((key) => {
    const inBucket = rows.filter(
      (r) => r.age_months !== null && agingBucketOf(r.age_months) === key
    );
    const balance = sumMoney(inBucket, (r) => r.balance);
    return {
      key,
      label: AGING_LABELS[key],
      count: inBucket.length,
      balance,
      shareOfOutstanding: denom.isZero()
        ? null
        : toMoney(balance).dividedBy(denom).toFixed(6),
    };
  });

  return { buckets, totalBalance };
}

// --- (c) per-developer rollups (M6 §5) --------------------------------------

export type DeveloperRollup = {
  /** The developer id, or null for the "Resale / Rental (no developer)" row. */
  developerId: string | null;
  developerName: string;
  /** Open, non-archived rows still owing money. */
  dealsWithBalance: number;
  /** Σ open balance for this developer (ties across rows to the outstanding). */
  balance: string;
  /** Σ collected_net across ALL statuses for this developer. */
  collectedNet: string;
  /** Σ total_collectible across all statuses — the % Collected denominator. */
  collectible: string;
  pctCollected: string | null;
  /** AVERAGE(days_to_first_release) over rows that have a first payment, or null. */
  avgDaysToFirstRelease: number | null;
};

const NO_DEVELOPER_LABEL = "Resale / Rental (no developer)";

/**
 * Per-developer rollup (M6 §5), including the "Resale / Rental (no developer)" row
 * for deals with no developer and a TOTAL that ties to the position totals. Rows are
 * ordered by outstanding balance, largest first, with the no-developer row last
 * before TOTAL.
 */
export function perDeveloperRollups(all: readonly ProjectionReceivable[]): {
  rows: DeveloperRollup[];
  total: DeveloperRollup;
} {
  const rows = active(all);
  const groups = new Map<string, ProjectionReceivable[]>();
  for (const r of rows) {
    const key = r.developer_id ?? " none";
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const rollups: DeveloperRollup[] = [];
  for (const [key, group] of groups) {
    const developerId = key === " none" ? null : group[0].developer_id;
    const withBalance = group.filter(isOpenWithBalance);
    const collectedNet = sumMoney(group, (r) => r.collected_net);
    const collectible = sumMoney(group, (r) => r.total_collectible);
    const days = group
      .map((r) => r.days_to_first_release)
      .filter((d): d is number => d !== null);

    rollups.push({
      developerId,
      developerName: developerId
        ? group[0].developer?.name ?? "(unknown developer)"
        : NO_DEVELOPER_LABEL,
      dealsWithBalance: withBalance.length,
      balance: sumMoney(withBalance, (r) => r.balance),
      collectedNet,
      collectible,
      pctCollected: pct(collectedNet, collectible),
      avgDaysToFirstRelease:
        days.length === 0
          ? null
          : Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    });
  }

  // Balance desc; the no-developer row sinks to the bottom; name breaks ties.
  rollups.sort((a, b) => {
    if (a.developerId === null && b.developerId !== null) return 1;
    if (b.developerId === null && a.developerId !== null) return -1;
    const balCmp = toMoney(b.balance).comparedTo(toMoney(a.balance));
    if (balCmp !== 0) return balCmp;
    return a.developerName.localeCompare(b.developerName);
  });

  const totalCollected = sumMoney(rows, (r) => r.collected_net);
  const totalCollectible = sumMoney(rows, (r) => r.total_collectible);
  const totalDays = rows
    .map((r) => r.days_to_first_release)
    .filter((d): d is number => d !== null);
  const total: DeveloperRollup = {
    developerId: null,
    developerName: "TOTAL",
    dealsWithBalance: rows.filter(isOpenWithBalance).length,
    balance: sumMoney(rows.filter(isOpenWithBalance), (r) => r.balance),
    collectedNet: totalCollected,
    collectible: totalCollectible,
    pctCollected: pct(totalCollected, totalCollectible),
    avgDaysToFirstRelease:
      totalDays.length === 0
        ? null
        : Math.round(totalDays.reduce((a, b) => a + b, 0) / totalDays.length),
  };

  return { rows: rollups, total };
}

// --- (d) chase projection (M6 §8, FR-M4-10) ---------------------------------

/** The Dashboard chase list's per-row follow-up state (WORKBOOK §6.8). */
export type ChaseFollowUp = "no_payment_yet" | "chase" | "ok";

export type ChaseRow = {
  dealId: string;
  dealCode: string;
  clientName: string;
  payor: string;
  developerName: string | null;
  balance: string | null;
  bookedNetGci: string;
  lastPaymentDate: string | null;
  monthsIdle: number | null;
  followUp: ChaseFollowUp;
  nextActionNote: string | null;
  /** confirmed_collectible is set — Total Collectible is user-overridden (blue). */
  overridden: boolean;
};

/**
 * The ordered open-balance chase projection (Rule Q via compareChasePriority) with
 * each row's follow-up state: "no payment yet" when never paid, "⚠ chase" when idle
 * ≥ the workspace chase_idle_months threshold (M6's rule — M4 supplies the number),
 * else "ok". `payor` is Rule S (developer for a Developer deal, else client).
 */
export function chaseProjection(
  all: readonly ProjectionReceivable[],
  chaseIdleMonths: number
): ChaseRow[] {
  return active(all)
    .filter((r) => r.status === "open")
    .sort(compareChasePriority)
    .map((r) => {
      const payor =
        r.deal_type === "developer"
          ? r.developer?.name ?? r.client_name
          : r.client_name;
      let followUp: ChaseFollowUp;
      if (r.last_payment_date === null) followUp = "no_payment_yet";
      else if (r.months_idle !== null && r.months_idle >= chaseIdleMonths)
        followUp = "chase";
      else followUp = "ok";

      return {
        dealId: r.deal_id,
        dealCode: r.deal_code,
        clientName: r.client_name,
        payor,
        developerName: r.developer?.name ?? null,
        balance: r.balance,
        bookedNetGci: r.booked_net_gci,
        lastPaymentDate: r.last_payment_date,
        monthsIdle: r.months_idle,
        followUp,
        nextActionNote: r.next_action_note,
        overridden: r.confirmed_collectible !== null,
      };
    });
}

// --- (e) per-lead-source rollups (M7) ---------------------------------------

export type SourceRollup = {
  leadSourceId: string;
  leadSourceName: string;
  deals: number;
  bookedNetGci: string;
  /** Σ open balance for this source. */
  outstandingNet: string;
  /** Σ collected_net (actual payments) for this source. */
  collectedNet: string;
  pctCollected: string | null;
  /** Σ booked_net_gci where deal_type ≠ developer (resale + rental). */
  resaleRentalNetGci: string;
  /** Σ booked_net_gci where deal_type = developer (pre-selling). */
  developerNetGci: string;
};

/**
 * Per-lead-source rollup (M7 Source Performance), optionally filtered to a booking
 * year. Names are resolved by the caller (a Map of id → name); an unmapped id shows
 * its raw value so a deleted source is still visible rather than dropped. Σ over the
 * rows ties to the position totals for the same year.
 */
export function perSourceRollups(
  all: readonly ProjectionReceivable[],
  sourceNames: Map<string, string>,
  bookedYear?: number
): { rows: SourceRollup[]; total: Omit<SourceRollup, "leadSourceId" | "leadSourceName"> } {
  const rows = active(all).filter(
    (r) => bookedYear === undefined || r.booked_year === bookedYear
  );

  const groups = new Map<string, ProjectionReceivable[]>();
  for (const r of rows) {
    const bucket = groups.get(r.lead_source_id);
    if (bucket) bucket.push(r);
    else groups.set(r.lead_source_id, [r]);
  }

  const rollups: SourceRollup[] = [];
  for (const [leadSourceId, group] of groups) {
    const open = group.filter(isOpenWithBalance);
    const bookedNetGci = sumMoney(group, (r) => r.booked_net_gci);
    const collectedNet = sumMoney(group, (r) => r.collected_net);
    const collectible = sumMoney(group, (r) => r.total_collectible);
    rollups.push({
      leadSourceId,
      leadSourceName: sourceNames.get(leadSourceId) ?? leadSourceId,
      deals: group.length,
      bookedNetGci,
      outstandingNet: sumMoney(open, (r) => r.balance),
      collectedNet,
      pctCollected: pct(collectedNet, collectible),
      resaleRentalNetGci: sumMoney(
        group.filter((r) => r.deal_type !== "developer"),
        (r) => r.booked_net_gci
      ),
      developerNetGci: sumMoney(
        group.filter((r) => r.deal_type === "developer"),
        (r) => r.booked_net_gci
      ),
    });
  }

  rollups.sort(
    (a, b) => toMoney(b.bookedNetGci).comparedTo(toMoney(a.bookedNetGci))
  );

  const open = rows.filter(isOpenWithBalance);
  const totalCollected = sumMoney(rows, (r) => r.collected_net);
  const totalCollectible = sumMoney(rows, (r) => r.total_collectible);
  return {
    rows: rollups,
    total: {
      deals: rows.length,
      bookedNetGci: sumMoney(rows, (r) => r.booked_net_gci),
      outstandingNet: sumMoney(open, (r) => r.balance),
      collectedNet: totalCollected,
      pctCollected: pct(totalCollected, totalCollectible),
      resaleRentalNetGci: sumMoney(
        rows.filter((r) => r.deal_type !== "developer"),
        (r) => r.booked_net_gci
      ),
      developerNetGci: sumMoney(
        rows.filter((r) => r.deal_type === "developer"),
        (r) => r.booked_net_gci
      ),
    },
  };
}

// --- (f) booking-year summary (M8 Report 5) ---------------------------------

export type BookingYearRow = {
  bookedYear: number;
  deals: number;
  bookedNetGci: string;
  collectedNet: string;
  outstandingNet: string;
};

/**
 * Booking-year summary (M8 Report 5): per booking year — deals, Σ booked_net_gci,
 * Σ collected, Σ outstanding. Rows sorted year descending; Σ over rows ties to the
 * position totals.
 */
export function bookingYearSummary(
  all: readonly ProjectionReceivable[]
): BookingYearRow[] {
  const rows = active(all);
  const groups = new Map<number, ProjectionReceivable[]>();
  for (const r of rows) {
    const bucket = groups.get(r.booked_year);
    if (bucket) bucket.push(r);
    else groups.set(r.booked_year, [r]);
  }

  return [...groups.entries()]
    .map(([bookedYear, group]) => ({
      bookedYear,
      deals: group.length,
      bookedNetGci: sumMoney(group, (r) => r.booked_net_gci),
      collectedNet: sumMoney(group, (r) => r.collected_net),
      outstandingNet: sumMoney(group.filter(isOpenWithBalance), (r) => r.balance),
    }))
    .sort((a, b) => b.bookedYear - a.bookedYear);
}

// --- (g) search projection (M9, FR-M4-13) -----------------------------------

export type ReceivableSearchFilters = {
  year?: number;
  status?: Receivable["status"];
  onlyWithBalance?: boolean;
  /** Case-insensitive match over client name + property details. */
  text?: string;
};

export type ReceivableSearchRow = {
  dealId: string;
  dealCode: string;
  clientName: string;
  propertyDetails: string;
  dealType: Receivable["deal_type"];
  totalCollectible: string;
  collectedNet: string;
  balance: string | null;
  status: Receivable["status"];
};

/**
 * M9's collectibles search projection: filter by year/status/has-balance/text and
 * sort balance high→low (WORKBOOK §11). Pure over the rows M9's read layer scopes.
 */
export function searchProjection(
  all: readonly ProjectionReceivable[],
  filters: ReceivableSearchFilters = {}
): ReceivableSearchRow[] {
  const needle = filters.text?.trim().toLowerCase() ?? "";
  return active(all)
    .filter((r) => {
      if (filters.year !== undefined && r.booked_year !== filters.year) return false;
      if (filters.status !== undefined && r.status !== filters.status) return false;
      if (
        filters.onlyWithBalance &&
        !(r.balance !== null && toMoney(r.balance).greaterThan(0))
      )
        return false;
      if (needle) {
        const hay = `${r.client_name} ${r.property_details}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const av = a.balance === null ? ZERO : toMoney(a.balance);
      const bv = b.balance === null ? ZERO : toMoney(b.balance);
      const cmp = bv.comparedTo(av);
      return cmp !== 0 ? cmp : a.deal_code.localeCompare(b.deal_code);
    })
    .map((r) => ({
      dealId: r.deal_id,
      dealCode: r.deal_code,
      clientName: r.client_name,
      propertyDetails: r.property_details,
      dealType: r.deal_type,
      totalCollectible: r.total_collectible,
      collectedNet: r.collected_net,
      balance: r.balance,
      status: r.status,
    }));
}
