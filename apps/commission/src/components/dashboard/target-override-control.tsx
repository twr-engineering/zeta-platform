"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/forms/form-status";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import type { ActionState } from "@/lib/forms/action-state";
import {
  setAnnualTargetOverride,
  clearAnnualTargetOverride,
} from "@/lib/dashboard/actions";
import { formatPHP } from "@/lib/money";

/**
 * The AnnualTargetOverride affordance (M6 §6, FR-M6-03) — the SaaS equivalent of
 * the workbook's blue E15 cell. The account owner sets/changes/clears the annual
 * GCI target for the year behind the standard confirmation + audit pattern (the
 * gate is mode 'checked'; the server action re-checks it and is the single audited
 * writer). The derived value is always shown alongside so an override is visibly a
 * deliberate departure from the formula ("derived: ₱16,920,000 from 2026 targets").
 *
 * Both gates capture their outcome into local state, because ConfirmGate owns its
 * action state and closes on success — the captured result is how the agent is
 * actually told the change landed (the tax-settings-form pattern). A successful
 * mutation revalidates /dashboard, so the tiles + pace bar restate on the refresh.
 */
export function TargetOverrideControl({
  year,
  annualTarget,
  derivedTarget,
  overridden,
  overrideNote,
}: {
  year: number;
  annualTarget: string | null;
  derivedTarget: string | null;
  overridden: boolean;
  overrideNote: string | null;
}) {
  const [outcome, setOutcome] = useState<ActionState | null>(null);

  const setWithOutcome = async (
    previous: ActionState,
    formData: FormData
  ): Promise<ActionState> => {
    const result = await setAnnualTargetOverride(previous, formData);
    setOutcome(result);
    return result;
  };

  const clearWithOutcome = async (
    previous: ActionState,
    formData: FormData
  ): Promise<ActionState> => {
    const result = await clearAnnualTargetOverride(previous, formData);
    setOutcome(result);
    return result;
  };

  // The amount the "change" modal prefills with — the current override, else the
  // derived value (a sensible starting point), else blank.
  const amountDefault =
    overridden && annualTarget ? annualTarget : derivedTarget ?? "";

  return (
    <div className="space-y-2" data-testid="target-override-control">
      <div className="flex flex-wrap items-center gap-2">
        <ConfirmGate
          testId="target-override-gate"
          trigger={
            <Button
              variant="outline"
              size="sm"
              data-testid="target-override-edit"
            >
              <Pencil className="size-3.5" />
              {overridden ? "Change target" : "Set target override"}
            </Button>
          }
          title={overridden ? "Change your annual target override" : "Override your annual target"}
          description={`This replaces the target for ${year} everywhere on the dashboard — the pace line and the monthly cumulative target restate to match.`}
          consequence="The change is audit-logged. The derived target stays available — clear the override to revert to it."
          gate={{ mode: "checked" }}
          confirmLabel={overridden ? "Change target" : "Set override"}
          action={setWithOutcome}
        >
          <input type="hidden" name="year" value={year} />
          <div className="space-y-1.5">
            <Label htmlFor="override-amount">Annual GCI target for {year}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">₱</span>
              <InputField
                id="override-amount"
                name="amount"
                align="end"
                inputMode="decimal"
                defaultValue={amountDefault}
                placeholder="15,000,000.00"
                data-testid="override-amount-input"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-note">Note (optional)</Label>
            <InputField
              id="override-note"
              name="note"
              defaultValue={overrideNote ?? ""}
              placeholder="Why this differs from the derived goal"
              maxLength={240}
              data-testid="override-note-input"
            />
          </div>
        </ConfirmGate>

        {overridden && (
          <ConfirmGate
            testId="target-clear-gate"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                data-testid="target-override-clear"
              >
                <X className="size-3.5" />
                Clear override
              </Button>
            }
            title="Clear the annual target override"
            description={`${year}'s target reverts to the derived goal${
              derivedTarget ? ` (${formatPHP(derivedTarget)})` : ""
            }.`}
            consequence="The change is audit-logged."
            gate={{ mode: "checked" }}
            confirmLabel="Clear override"
            action={clearWithOutcome}
          >
            <input type="hidden" name="year" value={year} />
          </ConfirmGate>
        )}
      </div>

      {outcome && <FormStatus state={outcome} />}
    </div>
  );
}
