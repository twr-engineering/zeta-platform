"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { SelectField } from "@/components/affordance/select-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/forms/form-status";
import { ComputedPanel } from "@/components/deals/computed-panel";
import { WarningBanners } from "@/components/deals/warning-banners";
import { createDeal, updateDeal } from "@/lib/deals/actions";
import { previewDeal } from "@/lib/deals/preview";
import { IDLE } from "@/lib/forms/action-state";
import { dealDetailPath, ROUTES } from "@/lib/routes";
import type { DealDerived } from "@/lib/engine";
import type { DealWarning } from "@/lib/deals/deal-warnings";
import type { RawDeal } from "@/lib/deals/schema";
import {
  DEAL_TYPE_CAPTIONS,
  MODE_OF_PAYMENT_CAPTION,
  MODE_OF_PAYMENT_LABELS,
  REPRESENTATION_CAPTIONS,
  REPRESENTATION_LABELS,
} from "@/lib/deals/labels";

/** Option shapes the page resolves from the active configuration lists. */
export type PropertyTypeOption = { id: string; name: string; inactive?: boolean };
export type DeveloperOption = { id: string; name: string; inactive?: boolean };
export type LeadSourceOption = { id: string; name: string; inactive?: boolean };

/** The camelCase field bag — one key per parseDeal input (schema.ts). */
export type DealFormValues = {
  bookedDate: string;
  transactionType: string;
  dealType: string;
  developerId: string;
  clientName: string;
  representation: string;
  propertyTypeId: string;
  leadSourceId: string;
  propertyDetails: string;
  modeOfPayment: string;
  listPrice: string;
  forceVat: boolean;
  commissionBasis: string;
  rate: string;
  fixedAmount: string;
  receiptIssued: boolean;
  incentiveBilled: string;
  incentiveTaxable: string;
  referralOutPct: string;
  referralOutFixed: string;
  referralPaid: boolean;
};

export type DealFormProps = {
  mode: "create" | "edit";
  propertyTypes: readonly PropertyTypeOption[];
  developers: readonly DeveloperOption[];
  leadSources: readonly LeadSourceOption[];
  /** Prefill for create (today, Manila) / the deal's own values for edit. */
  initialValues: DealFormValues;
  /** Edit only: the deal's id, code and version (optimistic lock). */
  edit?: { id: string; code: string; version: number };
};

const REPRESENTATION_OPTIONS = (
  ["double_ended", "seller", "buyer", "lessor", "lessee", "referrer"] as const
).map((value) => ({ value, label: REPRESENTATION_LABELS[value] }));

const MODE_OPTIONS = (["cash", "bank", "pagibig", "deferred_cash"] as const).map(
  (value) => ({ value, label: MODE_OF_PAYMENT_LABELS[value] })
);

/**
 * The effective deal type: a rental is always N/A (§4 rule 12), whatever the
 * picker last held.
 */
function effectiveDealType(values: DealFormValues): string {
  return values.transactionType === "rental" ? "n_a" : values.dealType;
}

/**
 * The form values as the flat record parseDeal reads — with the conditional
 * fields normalised exactly the way the visible form submits them, so the live
 * preview computes the same figures the save will book.
 */
function toRaw(values: DealFormValues): RawDeal {
  const dealType = effectiveDealType(values);
  const isDeveloper = dealType === "developer";
  return {
    bookedDate: values.bookedDate,
    transactionType: values.transactionType,
    dealType,
    developerId: isDeveloper ? values.developerId : "",
    clientName: values.clientName,
    representation: values.representation,
    propertyTypeId: values.propertyTypeId,
    leadSourceId: values.leadSourceId,
    propertyDetails: values.propertyDetails,
    modeOfPayment: values.modeOfPayment,
    listPrice: values.listPrice,
    forceVat: isDeveloper && values.forceVat ? "true" : "false",
    commissionBasis: values.commissionBasis,
    rate: values.commissionBasis === "percent" ? values.rate : "",
    fixedAmount: values.commissionBasis === "fixed" ? values.fixedAmount : "",
    // Developer deals are always receipted/taxable (§3.1 field 20).
    receiptIssued: isDeveloper ? "true" : values.receiptIssued ? "true" : "false",
    incentiveBilled: values.incentiveBilled,
    incentiveTaxable: values.incentiveTaxable,
    referralOutPct: values.referralOutPct,
    referralOutFixed: values.referralOutFixed,
    referralPaid: values.referralPaid ? "true" : "false",
  };
}

export function DealForm({
  mode,
  propertyTypes,
  developers,
  leadSources,
  initialValues,
  edit,
}: DealFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createDeal : updateDeal;
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [values, setValues] = useState<DealFormValues>(initialValues);

  const [derived, setDerived] = useState<DealDerived | null>(null);
  const [warnings, setWarnings] = useState<DealWarning[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [hint, setHint] = useState<string | undefined>();

  // A client-only signal that the controlled inputs are interactive. The effect
  // runs after hydration, so a test (or a fast human) that waits for
  // data-hydrated="true" never fires a change into a not-yet-hydrated <select>.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const dealType = effectiveDealType(values);
  const isDeveloper = dealType === "developer";
  const isRental = values.transactionType === "rental";
  const raw = useMemo(() => toRaw(values), [values]);
  const rawKey = useMemo(() => JSON.stringify(raw), [raw]);

  // Live computed panel (FR-M1-06): a debounced server round-trip through the
  // real engine, latest-wins so a slow response can't overwrite a newer one.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      const result = await previewDeal(raw, edit?.id);
      if (id !== requestId.current) return; // superseded
      setPreviewing(false);
      if (result.ok) {
        setDerived(result.derived);
        setWarnings(result.warnings);
        setHint(undefined);
      } else {
        setDerived(null);
        setWarnings([]);
        setHint(
          result.reason === "incomplete"
            ? "Fill in the required fields and the numbers appear here, live."
            : result.error
        );
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey, edit?.id]);

  // A successful save navigates: to the list on create, to the deal on edit.
  useEffect(() => {
    if (!state.message || state.error) return;
    router.push(mode === "edit" && edit ? dealDetailPath(edit.code) : ROUTES.deals);
    router.refresh();
  }, [state.message, state.error, mode, edit, router]);

  const set = <K extends keyof DealFormValues>(key: K, value: DealFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const isStale = state.error?.includes("changed since you opened") ?? false;
  const hasWarnings = warnings.length > 0;
  const submitLabel = hasWarnings
    ? "Save anyway"
    : mode === "create"
      ? "Log deal"
      : "Save changes";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ------------------------------ the form ----------------------------- */}
      <form
        action={formAction}
        className="space-y-8"
        data-testid="deal-form"
        data-hydrated={hydrated ? "true" : "false"}
      >
        {/* Hidden payload — the single source of what submits, kept identical to
            the preview raw (tax-settings-form pattern). Visible controls below
            carry no name; they only drive state. */}
        {Object.entries(raw).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value ?? ""} />
        ))}
        {edit && (
          <>
            <input type="hidden" name="id" value={edit.id} />
            <input type="hidden" name="expectedVersion" value={String(edit.version)} />
          </>
        )}

        {/* GROUP 1 — What closed */}
        <Group title="What closed" caption="The deal, the parties, and how it was sourced.">
          <FieldRow>
            <Field label="Booked date" htmlFor="bookedDate">
              <InputField
                id="bookedDate"
                type="date"
                value={values.bookedDate}
                onChange={(e) => set("bookedDate", e.target.value)}
                data-testid="field-bookedDate"
              />
            </Field>
            <Field label="Transaction type" htmlFor="transactionType">
              <SelectField
                id="transactionType"
                value={values.transactionType}
                onChange={(e) => set("transactionType", e.target.value)}
                options={[
                  { value: "sale", label: "Sale" },
                  { value: "rental", label: "Rental" },
                ]}
                data-testid="field-transactionType"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field
              label="Deal type"
              htmlFor="dealType"
              caption={dealType !== "" ? DEAL_TYPE_CAPTIONS[dealType as "developer" | "resale" | "n_a"] : undefined}
            >
              {isRental ? (
                <p
                  className="flex h-9 items-center text-sm text-muted-foreground"
                  data-testid="dealtype-rental-static"
                >
                  N/A — a rental has no developer.
                </p>
              ) : (
                <SelectField
                  id="dealType"
                  value={values.dealType === "n_a" ? "" : values.dealType}
                  onChange={(e) => set("dealType", e.target.value)}
                  placeholder="Choose…"
                  options={[
                    { value: "developer", label: "Developer" },
                    { value: "resale", label: "Resale" },
                  ]}
                  data-testid="field-dealType"
                />
              )}
            </Field>

            {isDeveloper && (
              <Field label="Developer" htmlFor="developerId">
                <SelectField
                  id="developerId"
                  value={values.developerId}
                  onChange={(e) => set("developerId", e.target.value)}
                  placeholder="Choose a developer…"
                  options={developers.map((d) => ({
                    value: d.id,
                    label: d.inactive ? `${d.name} (inactive)` : d.name,
                  }))}
                  data-testid="field-developerId"
                />
              </Field>
            )}
          </FieldRow>

          <FieldRow>
            <Field label="Client / counterparty" htmlFor="clientName">
              <InputField
                id="clientName"
                value={values.clientName}
                onChange={(e) => set("clientName", e.target.value)}
                placeholder="The party you represent"
                maxLength={160}
                data-testid="field-clientName"
              />
            </Field>
            <Field
              label="Representation"
              htmlFor="representation"
              caption={
                values.representation
                  ? REPRESENTATION_CAPTIONS[values.representation as keyof typeof REPRESENTATION_CAPTIONS]
                  : undefined
              }
            >
              <SelectField
                id="representation"
                value={values.representation}
                onChange={(e) => set("representation", e.target.value)}
                placeholder="Choose…"
                options={REPRESENTATION_OPTIONS}
                data-testid="field-representation"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="Property type" htmlFor="propertyTypeId">
              <SelectField
                id="propertyTypeId"
                value={values.propertyTypeId}
                onChange={(e) => set("propertyTypeId", e.target.value)}
                placeholder="Choose a property type…"
                options={propertyTypes.map((p) => ({
                  value: p.id,
                  label: p.inactive ? `${p.name} (inactive)` : p.name,
                }))}
                data-testid="field-propertyTypeId"
              />
            </Field>
            <Field label="Lead source" htmlFor="leadSourceId">
              <SelectField
                id="leadSourceId"
                value={values.leadSourceId}
                onChange={(e) => set("leadSourceId", e.target.value)}
                placeholder="Choose a lead source…"
                options={leadSources.map((s) => ({
                  value: s.id,
                  label: s.inactive ? `${s.name} (inactive)` : s.name,
                }))}
                data-testid="field-leadSourceId"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="Property details" htmlFor="propertyDetails">
              <InputField
                id="propertyDetails"
                value={values.propertyDetails}
                onChange={(e) => set("propertyDetails", e.target.value)}
                placeholder="Blk 5 Lot 20 Xavier Southwoods"
                maxLength={240}
                data-testid="field-propertyDetails"
              />
            </Field>
            <Field label="Mode of payment" htmlFor="modeOfPayment" caption={MODE_OF_PAYMENT_CAPTION}>
              <SelectField
                id="modeOfPayment"
                value={values.modeOfPayment}
                onChange={(e) => set("modeOfPayment", e.target.value)}
                placeholder="Choose…"
                options={MODE_OPTIONS}
                data-testid="field-modeOfPayment"
              />
            </Field>
          </FieldRow>
        </Group>

        {/* GROUP 2 — The money */}
        <Group title="The money" caption="The price, your rate, receipts, incentive and referral out.">
          <FieldRow>
            <Field
              label={isRental ? "Annual rent" : "List price (TCP)"}
              htmlFor="listPrice"
              caption={isRental ? "The full annual rent — the rate is one month of it." : undefined}
            >
              <InputField
                id="listPrice"
                inputMode="decimal"
                align="end"
                value={values.listPrice}
                onChange={(e) => set("listPrice", e.target.value)}
                placeholder="0.00"
                data-testid="field-listPrice"
              />
            </Field>

            {isDeveloper && (
              <Field label="Force VAT" caption="Adjacent-property rule: 2+ adjacent units, same developer, same buyer within 12 months. One deliberate toggle.">
                <CheckboxRow
                  id="forceVat"
                  checked={values.forceVat}
                  onChange={(v) => set("forceVat", v)}
                  label="Treat as VAT-able even under the ₱3.6M threshold"
                  testId="field-forceVat"
                />
              </Field>
            )}
          </FieldRow>

          <FieldRow>
            <Field label="Commission basis" htmlFor="commissionBasis">
              <SelectField
                id="commissionBasis"
                value={values.commissionBasis}
                onChange={(e) => set("commissionBasis", e.target.value)}
                options={[
                  { value: "percent", label: "% of base" },
                  { value: "fixed", label: "Fixed ₱" },
                ]}
                data-testid="field-commissionBasis"
              />
            </Field>

            {values.commissionBasis === "percent" ? (
              <Field
                label="Rate %"
                htmlFor="rate"
                caption="Your rate, already net of any co-broke split. Enter a % (5) or a fraction (1/12)."
              >
                <div className="flex gap-2">
                  <InputField
                    id="rate"
                    align="end"
                    value={values.rate}
                    onChange={(e) => set("rate", e.target.value)}
                    placeholder="5"
                    data-testid="field-rate"
                  />
                  {isRental && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => set("rate", "1/12")}
                      data-testid="rate-onemonth-preset"
                      title="One month of a one-year lease"
                    >
                      1 month (1/12)
                    </Button>
                  )}
                </div>
              </Field>
            ) : (
              <Field label="Fixed amount ₱" htmlFor="fixedAmount">
                <InputField
                  id="fixedAmount"
                  inputMode="decimal"
                  align="end"
                  value={values.fixedAmount}
                  onChange={(e) => set("fixedAmount", e.target.value)}
                  placeholder="0.00"
                  data-testid="field-fixedAmount"
                />
              </Field>
            )}
          </FieldRow>

          <FieldRow>
            <Field label="Receipt issued" caption="Resale/rental are untaxed unless a receipt is issued. Developer deals are always taxable.">
              {isDeveloper ? (
                <p
                  className="flex h-9 items-center text-sm text-muted-foreground"
                  data-testid="receipt-developer-static"
                >
                  Taxable — developer deal.
                </p>
              ) : (
                <CheckboxRow
                  id="receiptIssued"
                  checked={values.receiptIssued}
                  onChange={(v) => set("receiptIssued", v)}
                  label="A receipt was issued (makes this deal taxable)"
                  testId="field-receiptIssued"
                />
              )}
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="Incentive ₱ (as billed)" htmlFor="incentiveBilled" caption="Developer bonus on top of commission. Leave 0 if none.">
              <InputField
                id="incentiveBilled"
                inputMode="decimal"
                align="end"
                value={values.incentiveBilled}
                onChange={(e) => set("incentiveBilled", e.target.value)}
                placeholder="0.00"
                data-testid="field-incentiveBilled"
              />
            </Field>
            <Field label="Incentive taxable?" htmlFor="incentiveTaxable">
              <SelectField
                id="incentiveTaxable"
                value={values.incentiveTaxable}
                onChange={(e) => set("incentiveTaxable", e.target.value)}
                options={[
                  { value: "blank", label: "Follows the deal (default)" },
                  { value: "yes", label: "Yes — taxable" },
                  { value: "no", label: "No — carried as-is" },
                ]}
                data-testid="field-incentiveTaxable"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="Referral out % " htmlFor="referralOutPct" caption="A fee you disburse yourself to a 3rd party. Not for splits deducted at source.">
              <InputField
                id="referralOutPct"
                align="end"
                value={values.referralOutPct}
                onChange={(e) => set("referralOutPct", e.target.value)}
                placeholder="0"
                data-testid="field-referralOutPct"
              />
            </Field>
            <Field label="Referral out fixed ₱" htmlFor="referralOutFixed">
              <InputField
                id="referralOutFixed"
                inputMode="decimal"
                align="end"
                value={values.referralOutFixed}
                onChange={(e) => set("referralOutFixed", e.target.value)}
                placeholder="0.00"
                data-testid="field-referralOutFixed"
              />
            </Field>
          </FieldRow>

          <CheckboxRow
            id="referralPaid"
            checked={values.referralPaid}
            onChange={(v) => set("referralPaid", v)}
            label="Referral out already paid"
            testId="field-referralPaid"
          />
        </Group>

        <div className="space-y-3">
          <WarningBanners warnings={warnings} />
          <FormStatus state={state} />
          {isStale && (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              data-testid="reload-stale"
            >
              Reload the current version
            </Button>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} data-testid="deal-submit">
              {pending ? "Saving…" : submitLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(mode === "edit" && edit ? dealDetailPath(edit.code) : ROUTES.deals)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>

      {/* --------------------------- computed panel -------------------------- */}
      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <ComputedPanel derived={derived} pending={previewing} hint={hint} />
        </div>
      </aside>
    </div>
  );
}

// --- small layout helpers ----------------------------------------------------

function Group({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-base font-medium tracking-tight">{title}</h2>
        {caption && <p className="text-sm text-muted-foreground">{caption}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  htmlFor,
  caption,
  children,
}: {
  label: string;
  htmlFor?: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {caption && <p className="text-xs text-pretty text-muted-foreground">{caption}</p>}
    </div>
  );
}

function CheckboxRow({
  id,
  checked,
  onChange,
  label,
  testId,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  testId: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
        data-testid={testId}
      />
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}
