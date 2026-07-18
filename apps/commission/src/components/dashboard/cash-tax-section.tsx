import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/money";
import { paymentsPath } from "@/lib/routes";
import type { CashTaxSection as CashTaxData } from "@/lib/dashboard/sections";

import { DashboardSection } from "./section";

/**
 * Section 3 — CASH & TAX BREAKDOWN (M6 §3.3, FR-M6-04). The five-line waterfall
 * over ALL collected payments (year-filter-independent), with the workbook's own
 * explainer reproduced VERBATIM (WORKBOOK §6; the PRD requires it word-for-word).
 * Gross and the two "less" lines lead to the Net Cash total; Retained is the
 * identity Gross − VAT − EWT. Every figure is the server builder's string.
 */

type Line = {
  label: string;
  value: string;
  hint?: string;
  kind: "gross" | "less" | "total" | "retained";
  testId: string;
};

export function CashTaxSection({ data }: { data: CashTaxData }) {
  const lines: Line[] = [
    { label: "Gross collected", value: data.gross, kind: "gross", testId: "cash-tax-gross" },
    {
      label: "less Output VAT",
      value: data.vat,
      hint: "you remit to BIR",
      kind: "less",
      testId: "cash-tax-vat",
    },
    {
      label: "less EWT withheld",
      value: data.ewt,
      hint: "creditable — claimed back via BIR Form 2307",
      kind: "less",
      testId: "cash-tax-ewt",
    },
    { label: "Net Cash (bank)", value: data.netCash, kind: "total", testId: "cash-tax-net-cash" },
    { label: "Retained Cash", value: data.retained, kind: "retained", testId: "cash-tax-retained" },
  ];

  return (
    <DashboardSection
      index={3}
      title="Cash & Tax Breakdown"
      description="All collected payments — how gross commission nets down to bank cash."
      testId="section-cash-tax"
      action={
        <Link
          href={paymentsPath()}
          className="text-sm text-primary hover:underline"
          data-testid="cash-tax-view-payments"
        >
          View payments
        </Link>
      }
    >
      <div className="rounded-xl border ring-1 ring-foreground/5">
        <dl className="divide-y" data-testid="cash-tax-waterfall">
          {lines.map((line) => (
            <div
              key={line.label}
              className={cn(
                "flex items-baseline justify-between gap-4 px-4 py-2.5",
                line.kind === "total" && "bg-muted/40 font-medium",
                line.kind === "retained" && "border-t-2 font-medium"
              )}
            >
              <dt className="text-sm">
                <span
                  className={cn(
                    line.kind === "less" && "text-muted-foreground"
                  )}
                >
                  {line.label}
                </span>
                {line.hint && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({line.hint})
                  </span>
                )}
              </dt>
              <dd
                className={cn(
                  "shrink-0 tabular-nums",
                  line.kind === "less" ? "text-muted-foreground" : "text-foreground"
                )}
                data-testid={line.testId}
              >
                {line.kind === "less" && "− "}
                {formatPHP(line.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="max-w-prose text-xs text-pretty text-muted-foreground" data-testid="cash-tax-explainer">
        Net Cash = Gross − EWT (bank). Retained = also net of the VAT you owe. EWT
        comes back as an income-tax credit (Form 2307).
      </p>
    </DashboardSection>
  );
}
