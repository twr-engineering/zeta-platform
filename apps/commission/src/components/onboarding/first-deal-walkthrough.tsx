"use client";

/**
 * M10.3 — the step-5 first-deal walkthrough (FR-M10-07, AC2).
 *
 * TYPED-ALONG on the REAL M1 form (OQ1 default): the agent enters D021's offered
 * inputs into the actual /deals/new form (rendered inline via <DealForm sample>),
 * with coach-marks explaining each computed-panel figure as it appears. The sample
 * deal is booked is_sample=true, badged everywhere; the agent can then log the
 * optional ₱50,000 incentive release and, at the end, KEEP or REMOVE the sample.
 *
 * M10 owns no money: the DealForm's live panel and the payment split are M1/M5's
 * engine responses, rendered as-is. The coach-mark copy quotes those figures.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DealForm, type DealFormValues } from "@/components/deals/deal-form";
import type {
  DeveloperOption,
  LeadSourceOption,
  PropertyTypeOption,
} from "@/components/deals/deal-form";
import { CoachMarks } from "./coach-marks";
import { SamplePaymentStep } from "./sample-payment-step";
import { SampleBadge } from "@/components/sample/sample-badge";
import {
  cleanupSampleData,
  ensureSampleReferences,
  type SampleReferenceIds,
} from "@/lib/onboarding/sample";
import {
  D021_COACH_MARKS,
  D021_FIXTURE,
  D021_SAMPLE_PAYMENT,
} from "@/lib/onboarding/sample-fixture";
import { collectiblesPath, ROUTES } from "@/lib/routes";

type Phase = "intro" | "preparing" | "form" | "payment" | "cleanup";

export type FirstDealWalkthroughProps = {
  propertyTypes: readonly PropertyTypeOption[];
  developers: readonly DeveloperOption[];
  leadSources: readonly LeadSourceOption[];
  /** D021's reference ids, pre-resolved server-side (may be null → ensure on start). */
  sampleRefs: SampleReferenceIds;
  today: string;
  /** Finish the whole wizard (the wizard maps this to complete_onboarding). */
  onFinish: () => void;
};

function buildInitialValues(refs: SampleReferenceIds): DealFormValues {
  return {
    bookedDate: D021_FIXTURE.bookedDate,
    transactionType: D021_FIXTURE.transactionType,
    dealType: D021_FIXTURE.dealType,
    developerId: refs.developerId ?? "",
    clientName: D021_FIXTURE.clientName,
    representation: D021_FIXTURE.representation,
    propertyTypeId: refs.propertyTypeId ?? "",
    leadSourceId: refs.leadSourceId ?? "",
    propertyDetails: D021_FIXTURE.propertyDetails,
    modeOfPayment: D021_FIXTURE.modeOfPayment,
    listPrice: D021_FIXTURE.listPrice,
    forceVat: false,
    commissionBasis: D021_FIXTURE.commissionBasis,
    rate: D021_FIXTURE.rate,
    fixedAmount: "",
    receiptIssued: true,
    incentiveBilled: D021_FIXTURE.incentiveBilled,
    incentiveTaxable: D021_FIXTURE.incentiveTaxable,
    referralOutPct: "0",
    referralOutFixed: "0",
    referralPaid: false,
  };
}

export function FirstDealWalkthrough({
  propertyTypes,
  developers,
  leadSources,
  sampleRefs,
  today,
  onFinish,
}: FirstDealWalkthroughProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [refs, setRefs] = useState<SampleReferenceIds>(sampleRefs);
  const [options, setOptions] = useState({ propertyTypes, developers, leadSources });
  const [sampleDeal, setSampleDeal] = useState<{ id: string; code: string } | null>(null);
  const [paymentLogged, setPaymentLogged] = useState(false);
  const [coachActive, setCoachActive] = useState(true);
  const [pending, startTransition] = useTransition();
  const [cleanupPending, startCleanup] = useTransition();

  const refsResolved =
    refs.developerId && refs.propertyTypeId && refs.leadSourceId ? true : false;

  const startWalkthrough = () => {
    if (refsResolved) {
      setPhase("form");
      return;
    }
    // Ensure the three D021 reference items exist (guided setup), then merge the
    // freshly-created ones into the form's option lists so they are selectable.
    setPhase("preparing");
    startTransition(async () => {
      const resolved = await ensureSampleReferences();
      setRefs(resolved);
      setOptions((prev) => ({
        propertyTypes: mergeOption(prev.propertyTypes, resolved.propertyTypeId, D021_FIXTURE.propertyTypeName),
        developers: mergeOption(prev.developers, resolved.developerId, D021_FIXTURE.developerName),
        leadSources: mergeOption(prev.leadSources, resolved.leadSourceId, D021_FIXTURE.leadSourceName),
      }));
      setPhase("form");
    });
  };

  const handleSampleSaved = (deal: { id: string; code: string }) => {
    setSampleDeal(deal);
    setCoachActive(false);
    setPhase("payment");
  };

  const handleRemove = () => {
    startCleanup(async () => {
      await cleanupSampleData();
      onFinish();
    });
  };

  // ---- intro ---------------------------------------------------------------
  if (phase === "intro" || phase === "preparing") {
    return (
      <div className="space-y-5" data-testid="walkthrough-intro">
        <div className="space-y-2">
          <p className="text-sm text-pretty text-muted-foreground">
            Learn the deal form on a clearly-marked <SampleBadge /> deal. We&rsquo;ll
            offer the workbook&rsquo;s D021 example — a ₱8,000,000 Abrown Inc. house &
            lot — and coach-marks will explain every figure the engine computes as it
            appears. Type along; nothing here is real until you say so, and you can
            remove the sample in one click at the end.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={startWalkthrough} disabled={pending} data-testid="walkthrough-start">
            {pending ? "Preparing…" : "Start the guided sample"}
          </Button>
          <Button variant="ghost" onClick={onFinish} data-testid="walkthrough-skip">
            Skip — finish setup
          </Button>
        </div>
      </div>
    );
  }

  // ---- the real form + coach-marks -----------------------------------------
  if (phase === "form") {
    return (
      <div className="space-y-4" data-testid="walkthrough-form">
        <div className="flex items-center gap-2">
          <SampleBadge />
          <p className="text-sm text-muted-foreground">
            This is the real deal form. Type D021&rsquo;s values; the panel updates live.
          </p>
        </div>
        <DealForm
          mode="create"
          propertyTypes={options.propertyTypes}
          developers={options.developers}
          leadSources={options.leadSources}
          initialValues={buildInitialValues(refs)}
          sample
          onSampleSaved={handleSampleSaved}
        />
        {coachActive && (
          <CoachMarks
            marks={D021_COACH_MARKS}
            onFinish={() => setCoachActive(false)}
            onSkip={() => setCoachActive(false)}
          />
        )}
      </div>
    );
  }

  // ---- optional sample payment ---------------------------------------------
  if (phase === "payment" && sampleDeal) {
    return (
      <div className="space-y-5" data-testid="walkthrough-payment">
        <SavedNote code={sampleDeal.code} />
        {!paymentLogged ? (
          <SamplePaymentStep
            dealId={sampleDeal.id}
            dealLabel={`${sampleDeal.code} — ${D021_FIXTURE.clientName}`}
            today={today}
            onLogged={() => {
              setPaymentLogged(true);
              setPhase("cleanup");
            }}
            onSkip={() => setPhase("cleanup")}
          />
        ) : null}
      </div>
    );
  }

  // ---- keep or remove the sample -------------------------------------------
  return (
    <div className="space-y-5" data-testid="walkthrough-cleanup">
      {sampleDeal && <SavedNote code={sampleDeal.code} />}

      {paymentLogged && (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm"
          data-testid="walkthrough-balance-note"
        >
          Your ₱50,000 release split into Net Cash {" "}
          <span className="font-medium">₱{D021_SAMPLE_PAYMENT.split.netCash}</span>, and the
          sample&rsquo;s receivable balance is now{" "}
          <span className="font-medium">₱{D021_SAMPLE_PAYMENT.balanceAfter}</span>.{" "}
          {sampleDeal && (
            <Link
              href={collectiblesPath()}
              className="underline underline-offset-2"
              data-testid="walkthrough-collectibles-link"
            >
              See it on your Collectibles ledger →
            </Link>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-xl border p-5" data-testid="cleanup-offer">
        <div className="space-y-1">
          <h3 className="font-heading text-base font-medium">Keep or remove the sample?</h3>
          <p className="text-sm text-pretty text-muted-foreground">
            The sample deal — and any release you logged against it — is on your books
            with a <SampleBadge /> badge, included in your figures so you can explore.
            Keep it while you learn, or remove it now: one click deletes the payment,
            the receivable and the deal together, and your dashboards return to zero.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleRemove}
            disabled={cleanupPending}
            data-testid="cleanup-remove"
          >
            {cleanupPending ? "Removing…" : "Remove sample data"}
          </Button>
          <Button onClick={onFinish} disabled={cleanupPending} data-testid="cleanup-keep">
            Keep it — finish setup
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You can always remove it later from the sample banner, or from{" "}
          <Link href={ROUTES.deals} className="underline underline-offset-2">
            your deals
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function SavedNote({ code }: { code: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
      data-testid="walkthrough-saved-note"
    >
      <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
      <span>
        Saved <span className="font-medium">{code}</span> with NET GCI ₱
        {/* the figure the panel showed, quoted from the fixture */}
        <span className="font-medium">354,591.84</span> — it&rsquo;s on your books with a
      </span>
      <SampleBadge />
      <span>badge.</span>
    </div>
  );
}

/** Add a freshly-ensured reference item to an option list if it isn't already there. */
function mergeOption<T extends { id: string; name: string }>(
  list: readonly T[],
  id: string | null,
  name: string,
): T[] {
  if (!id || list.some((o) => o.id === id)) return [...list];
  return [...list, { id, name } as T];
}
