import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { LockedValue } from "@/components/affordance/locked-value";
import { formatPHP, formatYield } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import type { PlanningBasis } from "@/lib/yield";

/**
 * M2.4 — the Planning Basis card (PRD §6 / §3.4). Visually separated and labeled
 * "All-time realized — feeds the GCI Calculator; ignores the report-year filter" — it
 * is ALWAYS all-time (Rule 4), so flipping the year filter above never moves it. It
 * shows the two numbers the whole planning model runs on: the all-time blended yield
 * (AllTimeYield, 4 dp) and the all-time blended avg price (AllTimePrice, ₱), each with
 * a "used by the GCI Calculator" link into M3.
 *
 * The screen shows the DISPLAY-rounded figures; M3 consumes the FULL-precision decimals
 * over the PlanningBasis API (Rule 7 — the §3.4 identity yield × price = ₱381,676.31
 * only survives unrounded), never these strings. `basis_version` is shown as a small
 * provenance stamp (M3's cache-coherence token). Nulls → "—" when no sales deals exist.
 */
export function PlanningBasisCard({
  planningBasis,
  basisVersion,
}: {
  planningBasis: PlanningBasis;
  basisVersion: number;
}) {
  const { allTimeYield, allTimePrice } = planningBasis;

  return (
    <section
      className="space-y-4 rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-5"
      data-testid="planning-basis-card"
    >
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">Planning Basis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All-time realized — feeds the GCI Calculator; ignores the report-year filter above.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">All-time blended yield</p>
          <LockedValue
            variant="linked"
            className="text-2xl font-semibold tabular-nums"
            formula="AllTimeYield = all-time sales NET GCI ÷ all-time sales Volume (full precision to the calculator)"
            data-testid="planning-yield"
          >
            {allTimeYield === null ? "—" : formatYield(allTimeYield)}
          </LockedValue>
          <Link
            href={ROUTES.calculator}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            data-testid="planning-yield-link"
          >
            used by the GCI Calculator <ArrowUpRight className="size-3" />
          </Link>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">All-time blended avg price</p>
          <LockedValue
            variant="linked"
            className="text-2xl font-semibold tabular-nums"
            formula="AllTimePrice = all-time sales Volume ÷ all-time sales deals (full precision to the calculator)"
            data-testid="planning-price"
          >
            {allTimePrice === null ? "—" : formatPHP(allTimePrice)}
          </LockedValue>
          <Link
            href={ROUTES.calculator}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            data-testid="planning-price-link"
          >
            used by the GCI Calculator <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="planning-basis-version">
        {basisVersion === 0
          ? "No realized sales basis yet."
          : `Basis version ${basisVersion} · ${planningBasis.allTimeSalesDeals} all-time sales deals`}
      </p>
    </section>
  );
}
