import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { LockedValue } from "@/components/affordance/locked-value";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { formatPHP, formatRateAsPercent } from "@/lib/money";
import { formatManilaDateTime } from "@/lib/date/manila";

export const metadata: Metadata = { title: "Settings" };

/**
 * Read-only view of the real tax_settings row (M0 §3.3).
 *
 * Editing, validation, the recompute confirmation, and the audit viewer land in
 * M0.2 — so every value here renders locked. That is not a placeholder choice:
 * until the confirmed-recompute flow exists, an editable rate could silently
 * restate booked deals, which M0 rule 3 forbids.
 */
export default async function SettingsPage() {
  const context = await getWorkspaceContext();
  const taxSettings = context?.taxSettings ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Badge variant="secondary">M0</Badge>
      </div>

      {!taxSettings ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="No tax settings found"
          description="Every workspace is created with tax settings by the signup bootstrap. If you are seeing this, the database trigger did not run — check that the foundation migrations were applied."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tax Settings</CardTitle>
            <CardDescription>
              These four values drive every computation in the product — the
              commission engine, payment splits, and the chase flag.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Output VAT on commission"
              caption="BIR standard 12%."
              value={formatRateAsPercent(taxSettings.vat_rate)}
              formula="Commission VAT rate. GCI = billed ÷ (1 + VAT rate) on receipted deals."
            />

            <Field
              label="Expanded withholding tax (EWT)"
              caption="10% individual broker; 5% if ≤₱3M gross with a sworn declaration."
              value={formatRateAsPercent(taxSettings.ewt_rate)}
              formula="EWT = Net × EWT rate. Creditable against your annual income tax via Form 2307."
            />

            <Field
              label="Property VAT threshold"
              caption="BIR RR 1-2024 dwelling threshold."
              value={formatPHP(taxSettings.property_vat_threshold)}
              formula="Threshold-rule property types are exempt at or below this list price, VAT-able strictly above it."
            />

            <Field
              label="Chase idle threshold"
              caption="Flags a receivable for chasing once it has been idle this long."
              value={`${taxSettings.chase_idle_months} month${
                taxSettings.chase_idle_months === 1 ? "" : "s"
              }`}
              formula="⚠ chase when months idle ≥ this value."
            />

            <div className="sm:col-span-2">
              <Field
                label="VAT registration"
                caption={
                  taxSettings.vat_registered_confirmed_at
                    ? `Confirmed ${formatManilaDateTime(
                        taxSettings.vat_registered_confirmed_at
                      )}.`
                    : "Not yet confirmed — the onboarding wizard still needs to ask. Until then this is a default, not your answer."
                }
                value={
                  taxSettings.vat_registered
                    ? "VAT-registered"
                    : "Not VAT-registered"
                }
                variant={
                  taxSettings.vat_registered_confirmed_at ? "locked" : "linked"
                }
                formula="Drives engine mode: VAT-registered applies ÷1.12 and VAT memos; non-VAT turns commission VAT off entirely (EWT still applies)."
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type FieldProps = {
  label: string;
  caption: string;
  value: string;
  formula: string;
  variant?: "locked" | "linked";
};

function Field({ label, caption, value, formula, variant }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      <LockedValue variant={variant} formula={formula} className="w-full">
        {value}
      </LockedValue>
      <p className="text-xs text-pretty text-muted-foreground">{caption}</p>
    </div>
  );
}
