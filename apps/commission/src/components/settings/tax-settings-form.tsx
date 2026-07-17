"use client";

import { useActionState, useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { IDLE, type ActionState } from "@/lib/forms/action-state";
import { saveTaxSettings } from "@/lib/settings/actions";
import { recomputeConsequence, taxRestatingCount } from "@/lib/settings/recompute";
import {
  TAX_FIELD_LABELS,
  diffTaxSettings,
  parseTaxSettingsForm,
  requiresConfirmation,
  restatingFields,
  taxSettingsToFormInput,
  type TaxField,
  type TaxSettingsFormInput,
  type TaxSettingsValues,
} from "@/lib/settings/tax";
import { formatManilaDateTime } from "@/lib/date/manila";

/**
 * Tax Settings, editable (M0 §6, FR-M0-03).
 *
 * The captions are the workbook's own (Settings C6–C9), kept verbatim where they
 * were already plain English: this screen replaces a spreadsheet the agent
 * already knows, and renaming its labels would make them relearn it.
 *
 * WHY THE SAVE BUTTON HAS TWO SHAPES
 *
 * Changing a rate restates money that is already booked, so it goes through the
 * friction gate (rule 9) and states its consequence (rule 3). Changing the chase
 * threshold moves no peso figure, so it just saves. The decision is
 * `requiresConfirmation`, and this component does not own it — the server calls
 * the same function on the same diff and refuses a gated change that arrives
 * without a confirmation. What is here is the courtesy: the modal, and a Save
 * button that will not submit values the server would reject.
 */

export type TaxSettingsFormProps = {
  settings: TaxSettingsValues & {
    vat_registered_confirmed_at: string | null;
  };
  /**
   * From the server: how many deals each kind of restatement would touch.
   * `rate` for a vat_rate / ewt_rate / vat_registered change (every taxable
   * deal); `threshold` for a property-VAT-threshold change (threshold-rule
   * developer deals). The form picks the honest one for the fields in play.
   */
  affectedDeals: { rate: number; threshold: number };
};

export function TaxSettingsForm({ settings, affectedDeals }: TaxSettingsFormProps) {
  const before: TaxSettingsValues = {
    vat_rate: settings.vat_rate,
    vat_registered: settings.vat_registered,
    ewt_rate: settings.ewt_rate,
    property_vat_threshold: settings.property_vat_threshold,
    chase_idle_months: settings.chase_idle_months,
  };

  const [form, setForm] = useState<TaxSettingsFormInput>(() =>
    taxSettingsToFormInput(before)
  );
  const [answeringVatQuestion, setAnsweringVatQuestion] = useState(false);
  const [state, formAction] = useActionState(saveTaxSettings, IDLE);

  const [gateState, setGateState] = useState<ActionState | null>(null);

  /**
   * The gate's action, wrapped so its outcome outlives the gate.
   *
   * `ConfirmGate` owns the action state internally and closes on success — and
   * the gate below is conditional, so a successful save empties the diff and
   * unmounts it in the same beat. Both of those destroy the result. Caught here
   * instead, the agent is actually told their rate change landed; found in the
   * browser, where the save worked perfectly and said nothing at all.
   */
  const saveWithConfirmation = async (
    previous: ActionState,
    formData: FormData
  ): Promise<ActionState> => {
    const result = await saveTaxSettings(previous, formData);
    setGateState(result);
    return result;
  };

  const vatQuestionUnanswered = settings.vat_registered_confirmed_at === null;

  const parsed = parseTaxSettingsForm(form);
  const errors = parsed.ok ? {} : parsed.errors;
  const changed = parsed.ok ? diffTaxSettings(before, parsed.values) : [];
  const restating = restatingFields(changed);
  const needsGate = requiresConfirmation(changed);

  // The honest count for the fields actually being changed (pure + unit-tested).
  const restatingCount = taxRestatingCount(restating, affectedDeals);

  // Answering the VAT question is a save even when the answer matches the
  // current default — that is the whole point of confirming it.
  const hasSomethingToSave =
    changed.length > 0 || (answeringVatQuestion && vatQuestionUnanswered);
  const canSave = parsed.ok && hasSomethingToSave;

  const set = <K extends keyof TaxSettingsFormInput>(
    key: K,
    value: TaxSettingsFormInput[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const payload = (
    <TaxPayloadInputs form={form} answeringVatQuestion={answeringVatQuestion} />
  );

  return (
    <div className="space-y-6">
      {/* Whichever path last reported: the plain form's, or the gate's. */}
      <FormStatus state={gateState ?? state} />

      <div className="grid gap-5 sm:grid-cols-2">
        <PercentField
          id="vat-rate"
          label={TAX_FIELD_LABELS.vat_rate}
          caption="BIR standard 12%. Applies to your commission when you are VAT-registered."
          value={form.vatRatePercent}
          onChange={(value) => set("vatRatePercent", value)}
          error={errors.vat_rate}
          testId="vat-rate-input"
        />

        <PercentField
          id="ewt-rate"
          label={TAX_FIELD_LABELS.ewt_rate}
          caption="10% individual broker; 5% if your gross commission is ₱3M or less for the year and you file a sworn declaration with your payor. The 5% is worth asking about — it is half the cash withheld from every payment, credited back via Form 2307 at year end either way."
          value={form.ewtRatePercent}
          onChange={(value) => set("ewtRatePercent", value)}
          error={errors.ewt_rate}
          testId="ewt-rate-input"
        />

        <div className="space-y-1.5">
          <Label htmlFor="property-vat-threshold">
            {TAX_FIELD_LABELS.property_vat_threshold}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">₱</span>
            <InputField
              id="property-vat-threshold"
              align="end"
              inputMode="decimal"
              value={form.propertyVatThreshold}
              onChange={(event) =>
                set("propertyVatThreshold", event.target.value)
              }
              aria-invalid={Boolean(errors.property_vat_threshold)}
              data-testid="property-vat-threshold-input"
            />
          </div>
          <FieldNote
            error={errors.property_vat_threshold}
            caption="BIR RR 1-2024 dwelling threshold. A threshold-rule property is exempt at or below this list price, and VAT-able strictly above it — exactly ₱3,600,000.00 is exempt."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="chase-idle-months">
            {TAX_FIELD_LABELS.chase_idle_months}
          </Label>
          <div className="flex items-center gap-2">
            <InputField
              id="chase-idle-months"
              align="end"
              inputMode="numeric"
              className="w-24"
              value={form.chaseIdleMonths}
              onChange={(event) => set("chaseIdleMonths", event.target.value)}
              aria-invalid={Boolean(errors.chase_idle_months)}
              data-testid="chase-idle-months-input"
            />
            <span className="text-sm text-muted-foreground">months</span>
          </div>
          <FieldNote
            error={errors.chase_idle_months}
            caption="Flags a receivable to chase once it has gone this long without a payment."
          />
        </div>
      </div>

      <VatRegistrationField
        registered={form.vatRegistered}
        onChange={(value) => set("vatRegistered", value)}
        unanswered={vatQuestionUnanswered}
        confirmedAt={settings.vat_registered_confirmed_at}
        answering={answeringVatQuestion}
        onAnsweringChange={setAnsweringVatQuestion}
      />

      {needsGate ? (
        <ConfirmGate
          testId="tax-confirm-gate"
          trigger={
            <Button disabled={!canSave} data-testid="save-tax-settings-button">
              Save changes
            </Button>
          }
          title="This changes how your money is calculated"
          description={`You are changing ${restating
            .map((field: TaxField) => TAX_FIELD_LABELS[field])
            .join(", ")}.`}
          consequence={recomputeConsequence(restating, restatingCount)}
          gate={{ mode: "checked" }}
          confirmLabel="Save changes"
          action={saveWithConfirmation}
        >
          {payload}
        </ConfirmGate>
      ) : (
        <form
          action={formAction}
          // Drop the gate's last outcome, or a plain save would keep reporting
          // the message from a rate change made minutes ago.
          onSubmit={() => setGateState(null)}
        >
          {payload}
          <SubmitButton
            pendingLabel="Saving…"
            disabled={!canSave}
            data-testid="save-tax-settings-button"
          >
            Save changes
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

/**
 * The payload, as hidden inputs.
 *
 * The visible fields carry no `name` on purpose: the same values have to be
 * submittable from two different forms (the plain one below, and the gate's,
 * which lives in a portal), and duplicating names across both would be a bug
 * waiting for the day someone renders both.
 */
function TaxPayloadInputs({
  form,
  answeringVatQuestion,
}: {
  form: TaxSettingsFormInput;
  answeringVatQuestion: boolean;
}) {
  return (
    <>
      <input type="hidden" name="vatRatePercent" value={form.vatRatePercent} />
      <input type="hidden" name="ewtRatePercent" value={form.ewtRatePercent} />
      <input
        type="hidden"
        name="propertyVatThreshold"
        value={form.propertyVatThreshold}
      />
      <input type="hidden" name="chaseIdleMonths" value={form.chaseIdleMonths} />
      {form.vatRegistered && (
        <input type="hidden" name="vatRegistered" value="on" />
      )}
      {answeringVatQuestion && (
        <input type="hidden" name="confirmVatRegistration" value="on" />
      )}
    </>
  );
}

type PercentFieldProps = {
  id: string;
  label: string;
  caption: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  testId: string;
};

function PercentField({
  id,
  label,
  caption,
  value,
  onChange,
  error,
  testId,
}: PercentFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <InputField
          id={id}
          align="end"
          inputMode="decimal"
          className="w-28"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          data-testid={testId}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <FieldNote error={error} caption={caption} />
    </div>
  );
}

function FieldNote({ error, caption }: { error?: string; caption: string }) {
  if (error) {
    return (
      <p role="alert" className="text-xs text-destructive" data-testid="field-error">
        {error}
      </p>
    );
  }
  return <p className="text-xs text-pretty text-muted-foreground">{caption}</p>;
}

/**
 * The VAT-registration question (M0 §3.3, rule 13).
 *
 * NULL confirmation means "not yet asked" — never a silent yes. M10's wizard
 * puts the question properly; until then this screen is the only place an agent
 * can answer it, so it says plainly that the current value is a default rather
 * than their answer.
 *
 * Note what it does NOT do: flipping this does not silently move the EWT rate.
 * The flag sets the *default* (10% registered / 5% not), but the rate stays the
 * agent's to set — a non-VAT agent without a sworn declaration is still withheld
 * 10%, and a settings screen that quietly rewrites a second money field while
 * you answer a yes/no question is exactly the silent restatement rule 3 exists
 * to stop. It offers the number and lets them type it.
 */
function VatRegistrationField({
  registered,
  onChange,
  unanswered,
  confirmedAt,
  answering,
  onAnsweringChange,
}: {
  registered: boolean;
  onChange: (value: boolean) => void;
  unanswered: boolean;
  confirmedAt: string | null;
  answering: boolean;
  onAnsweringChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">{TAX_FIELD_LABELS.vat_registered}</div>
        <p className="text-xs text-pretty text-muted-foreground">
          Are you VAT-registered with the BIR? If you are, your commission
          carries 12% output VAT and the engine divides receipted amounts by
          1.12. If you are not, commission VAT is off entirely — EWT still
          applies. Registration is mandatory above ₱3M gross per year.
        </p>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="vat-registered"
          checked={registered}
          onCheckedChange={(value) => {
            onChange(value === true);
            // Touching the control is answering the question.
            onAnsweringChange(true);
          }}
          className="mt-0.5"
          data-testid="vat-registered-checkbox"
        />
        <Label htmlFor="vat-registered" className="text-sm font-normal">
          I am VAT-registered with the BIR.
        </Label>
      </div>

      {unanswered ? (
        <div
          className="space-y-2.5 rounded-md border border-affordance-linked bg-affordance-linked/40 p-3"
          data-testid="vat-unconfirmed-notice"
        >
          <p className="text-xs text-pretty">
            We have not asked you this yet, so the value above is a default —
            not your answer. Confirm it and we will stop treating it as a guess.
          </p>
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="confirm-vat-registration"
              checked={answering}
              onCheckedChange={(value) => onAnsweringChange(value === true)}
              className="mt-0.5"
              data-testid="confirm-vat-registration-checkbox"
            />
            <Label
              htmlFor="confirm-vat-registration"
              className="text-sm font-normal"
            >
              This is my answer, not a default.
            </Label>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="vat-confirmed-note">
          Confirmed {confirmedAt ? formatManilaDateTime(confirmedAt) : "—"}.
        </p>
      )}
    </div>
  );
}
