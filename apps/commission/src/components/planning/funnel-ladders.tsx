"use client";

import { InputField } from "@/components/affordance/input-field";
import { formatAmount } from "@/lib/money";
import type { Funnel, FunnelRates, PlanIssue } from "@/lib/planning";

/**
 * M3.3 §6 funnel ladders (FR-M3-07). Each ladder renders top→down (leads widest at the
 * top, closed deals at the bottom) over the engine's bottom→top stages. The count on
 * every stage is LOCKED (the engine's 2-dp value); the conversion RATE between two
 * stages is the module's blue input — editing it recomputes the whole plan INSTANTLY
 * (the orchestrator holds the rate state and re-runs computePlan; Rule 8, <100 ms) and
 * persists on confirm. A rate outside (0, 1] shows an inline error and the ladder holds
 * its last good counts.
 */

/** stage.key (engine) → the FunnelRates field its inbound rate edits. */
export const STAGE_TO_RATE: Record<string, keyof FunnelRates> = {
  listings_to_take: "listingToSold",
  listing_appointments: "listingAppointmentRate",
  seller_contacts: "sellerContactToAppt",
  seller_leads: "sellerLeadToContact",
  viewings: "buyerViewingToAtp",
  buyer_contacts: "buyerContactToViewing",
  buyer_leads: "buyerLeadToContact",
};

export function FunnelLadder({
  funnel,
  title,
  ratesPercent,
  onRateChange,
  issues,
}: {
  funnel: Funnel;
  title: string;
  ratesPercent: Record<keyof FunnelRates, string>;
  onRateChange: (field: keyof FunnelRates, value: string) => void;
  issues: PlanIssue[];
}) {
  const reversed = [...funnel.stages].reverse();

  return (
    <div className="space-y-2 rounded-xl border p-4 ring-1 ring-foreground/5" data-testid={`funnel-${funnel.side}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="space-y-1">
        {reversed.map((stage) => {
          const field = STAGE_TO_RATE[stage.key];
          const rateIssue =
            field !== undefined &&
            issues.some((i) => i.code === "rate_out_of_range" && i.field === field);
          return (
            <li key={stage.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-affordance-locked/60 px-3 py-2">
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="text-right tabular-nums">
                  <span className="font-semibold" data-testid={`funnel-${stage.key}-yearly`}>
                    {formatAmount(stage.counts.yearly)}
                  </span>
                  <span
                    className="ml-2 text-xs text-muted-foreground"
                    data-testid={`funnel-${stage.key}-weekly`}
                  >
                    {formatAmount(stage.counts.weekly)}/wk
                  </span>
                </span>
              </div>

              {stage.rate !== null && field !== undefined && (
                <div className="flex items-center justify-center gap-1.5 py-0.5 text-xs text-muted-foreground">
                  <span aria-hidden="true">÷</span>
                  <InputField
                    align="end"
                    inputMode="decimal"
                    aria-label={`${stage.label} conversion rate (%)`}
                    aria-invalid={rateIssue || undefined}
                    className={`h-7 w-16 ${rateIssue ? "border-destructive ring-destructive/40" : ""}`}
                    value={ratesPercent[field]}
                    onChange={(e) => onRateChange(field, e.target.value)}
                    data-testid={`rate-${field}`}
                  />
                  <span aria-hidden="true">%</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
