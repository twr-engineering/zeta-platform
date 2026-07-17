import { CheckCircle2, TriangleAlert } from "lucide-react";

import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ImportPlan } from "@/lib/import/types";

/**
 * M1.4 — the import summary (FR-M1-10). Renders the dry-run (and post-import)
 * report: per-leg counts, the reconciliation verdict + any mismatches, the created
 * list items, non-blocking notices, and the reconciled §9 anchor figures. Mobile-
 * sane: the mismatch table scrolls inside its own container, everything else stacks.
 */

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Money({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", emphasis && "border-primary/40 bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{formatPHP(value)}</div>
    </div>
  );
}

export function ImportSummary({ plan }: { plan: ImportPlan }) {
  const { counts, anchors, mismatches, notices, headerChecks } = plan;
  const clean = mismatches.length === 0;
  const headerDrift = headerChecks.filter((h) => !h.ok);

  return (
    <div data-testid="import-summary" className="space-y-6">
      {/* Reconciliation verdict */}
      <div
        data-testid="import-reconciliation"
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          clean
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-destructive/30 bg-destructive/5"
        )}
      >
        {clean ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        )}
        <div className="text-sm">
          {clean ? (
            <p>
              <span className="font-medium">Every figure ties to the workbook within ₱0.01.</span>{" "}
              All {counts.deals} deals and {counts.payments} payments recomputed to the cached
              values to the centavo (D001&apos;s lost-cache row recovered).
            </p>
          ) : (
            <p>
              <span className="font-medium">
                {mismatches.length} {mismatches.length === 1 ? "figure disagrees" : "figures disagree"}{" "}
                with the workbook by more than ₱0.01.
              </span>{" "}
              These rows are reported below and will NOT be imported.
            </p>
          )}
        </div>
      </div>

      {/* Per-leg counts */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">What will be imported</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Deals" value={counts.deals} />
          <Stat label="Payments" value={counts.payments} />
          <Stat label="Closed statuses" value={counts.closed_statuses} />
          <Stat label="Next new deal" value={counts.next_deal_code} />
          <Stat label="Property types" value={counts.property_types} />
          <Stat label="Developers" value={counts.developers} />
          <Stat label="Lead sources" value={counts.lead_sources} />
          <Stat label="Collectible states" value={counts.overlays} />
        </div>
      </section>

      {/* Anchor figures (Master PRD §9) */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Position after import</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Money label="Total Collectible (Σ cash expected in)" value={anchors.total_collectible} emphasis />
          <Money label="Collected — net of VAT (Σ payments)" value={anchors.payment_net_collected} />
          <Money label="Outstanding balance (activates in M4.2)" value={anchors.outstanding_pending} />
          <Money label="Booked NET GCI (earned)" value={anchors.booked_net_gci} />
        </div>
        <p className="text-xs text-muted-foreground">
          Outstanding balance is a payment-derived figure Collections math (M4.2) will compute per
          receivable — the importer reports the expected total; the receivable&apos;s balance column
          activates then.
        </p>
      </section>

      {/* Mismatches (only when reconciliation failed) */}
      {!clean && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-destructive">Reported mismatches</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Recomputed</th>
                  <th className="px-3 py-2 font-medium">Workbook</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((m, i) => (
                  <tr key={`${m.code}-${m.field}-${i}`} className="border-t">
                    <td className="px-3 py-2 font-medium tabular-nums">{m.code}</td>
                    <td className="px-3 py-2">
                      <span className="text-muted-foreground">{m.scope}·</span>
                      {m.field}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{m.expected}</td>
                    <td className="px-3 py-2 tabular-nums">{m.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Created list items */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Settings &amp; lists</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ListBlock title="Property types" items={plan.payload.property_types.map((p) => `${p.name} · ${labelVatRule(p.vat_rule)}`)} />
          <ListBlock title="Developers" items={plan.payload.developers.map((d) => `${d.name} · ${d.comm_base === "gross" ? "Gross" : "Net"}`)} />
          <ListBlock title="Lead sources" items={plan.payload.lead_sources.map((l) => l.name)} />
        </div>
      </section>

      {/* Notices + header drift */}
      {(notices.length > 0 || headerDrift.length > 0) && (
        <section className="space-y-2 text-xs text-muted-foreground">
          {headerDrift.length > 0 && (
            <p>
              <span className="font-medium text-amber-600">Header drift:</span>{" "}
              {headerDrift.map((h) => `${h.sheet}!${h.column} (expected "${h.expected}", found "${h.found}")`).join("; ")}
            </p>
          )}
          {notices.map((n, i) => (
            <p key={i}>
              <span className="font-medium">Note:</span> {n}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="mt-1.5 space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i} className="truncate">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelVatRule(rule: string): string {
  if (rule === "always_vat") return "Always VAT";
  if (rule === "always_exempt") return "Always Exempt";
  return "Threshold";
}
