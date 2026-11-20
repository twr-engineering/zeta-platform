import { formatPHP, formatRateAsPercent } from "@/lib/money";
import { paymentsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TargetSection as TargetData } from "@/lib/dashboard/sections";

import { DashboardSection } from "./section";
import { StatTile } from "./stat-tile";
import { PaceBar } from "./pace-bar";
import { TargetOverrideControl } from "./target-override-control";

/**
 * Section 2 — COLLECTED GCI vs TARGET (M6 §3.3, FR-M6-02/03). The selected year's
 * collections against the annual GCI target, with the day-accurate pace bar and the
 * ahead/behind line. This section and Monthly Cash-In are the ONLY two the year
 * filter restates. A "—" everywhere when the year has no target row and no override
 * (rule 9 — never an error). The override affordance is the account owner's second
 * write path, behind the confirmation + audit pattern.
 */
export function TargetSection({ data }: { data: TargetData }) {
  const { dashboardYear: year, annualTarget, overridden } = data;
  const hasTarget = annualTarget !== null;

  return (
    <DashboardSection
      index={2}
      title="Collected GCI vs Target"
      description={`Paid in ${year} against your annual goal — day-accurate pace.`}
      testId="section-target"
    >
      <div className="space-y-4 rounded-xl border p-4 ring-1 ring-foreground/5">
        {/* target + override badge */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Annual GCI target · {year}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p
                className="text-2xl font-semibold tabular-nums tracking-tight"
                data-testid="target-annual-value"
              >
                {hasTarget ? formatPHP(annualTarget) : "—"}
              </p>
              {overridden && (
                <Tooltip>
                  <TooltipTrigger
                    tabIndex={0}
                    className="cursor-help"
                    render={
                      <span
                        data-testid="target-override-badge"
                        className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-900 dark:bg-sky-950/60 dark:text-sky-200"
                      >
                        override
                      </span>
                    }
                  />
                  <TooltipContent>
                    {data.overrideNote?.trim()
                      ? data.overrideNote
                      : "Manual override of the derived target."}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="target-provenance">
              {provenance(data)}
            </p>
          </div>

          <TargetOverrideControl
            year={year}
            annualTarget={annualTarget}
            derivedTarget={data.derivedTarget}
            overridden={overridden}
            overrideNote={data.overrideNote}
          />
        </div>

        {/* the four measures */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={`Collected · ${year}`}
            value={formatPHP(data.collectedForYear)}
            caption="Net of VAT, paid this year"
            href={paymentsPath({ year })}
            hrefTitle={`View ${year} payments`}
            testId="tile-collected-year"
          />
          <StatTile
            label="% of target"
            value={data.pctOfTarget === null ? "—" : formatRateAsPercent(data.pctOfTarget)}
            tone={data.pctOfTarget === null ? "muted" : "default"}
            testId="tile-pct-of-target"
          />
          <StatTile
            label="Pace to date"
            value={data.paceToDate === null ? "—" : formatPHP(data.paceToDate)}
            tone={data.paceToDate === null ? "muted" : "default"}
            caption="Where the calendar says you'd be"
            testId="tile-pace-to-date"
          />
          <StatTile
            label="vs pace"
            value={
              data.paceLabel === null || data.vsPaceMagnitude === null
                ? "—"
                : formatPHP(data.vsPaceMagnitude)
            }
            tone={
              data.paceLabel === null
                ? "muted"
                : data.paceLabel === "ahead"
                  ? "positive"
                  : "negative"
            }
            caption={data.paceLabel ?? undefined}
            testId="tile-vs-pace"
          />
        </div>

        {/* pace bar + the ahead/behind line */}
        <div className="space-y-2">
          <PaceBar
            pctOfTarget={data.pctOfTarget}
            paceFraction={data.paceFraction}
            paceLabel={data.paceLabel}
          />
          {data.paceLabel === null || data.vsPaceMagnitude === null ? (
            <p className="text-sm text-muted-foreground" data-testid="pace-line">
              Set a target for {year} to track your pace.
            </p>
          ) : (
            <p
              className={cn(
                "text-sm font-medium",
                data.paceLabel === "ahead" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"
              )}
              data-testid="pace-line"
              data-pace={data.paceLabel}
            >
              {data.paceLabel} by {formatPHP(data.vsPaceMagnitude)}
            </p>
          )}
        </div>
      </div>
    </DashboardSection>
  );
}

/** The derivation provenance under the target (§6 "derived: ₱… from … targets"). */
function provenance(data: TargetData): string {
  if (data.overridden) {
    return data.derivedTarget
      ? `Derived: ${formatPHP(data.derivedTarget)} from ${data.dashboardYear} targets`
      : `No derived target for ${data.dashboardYear} yet — this is a manual override`;
  }
  if (data.derivedTarget) {
    return `Derived from your ${data.dashboardYear} planning targets`;
  }
  return `No target set for ${data.dashboardYear} — set one to track pace`;
}
