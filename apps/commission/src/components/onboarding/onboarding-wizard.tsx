"use client";

/**
 * M10.2 — the first-run wizard shell (FR-M10-01/08, PRD §6.1).
 *
 * RESUMABLE (rule 2): current_step is persisted after every transition, so a
 * reload lands back on the same step. NEVER-BLOCKING (rule 1): "Set up later"
 * dismisses in one click at every step and the app stays fully usable. The steps
 * EMBED the real M0/M1 flows (rename, tax settings, seed offer, importer) — no
 * forked copies; every audited/financial write still flows through their own
 * functions and audit trail. M10 owns no money.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import {
  RenameWorkspaceForm,
} from "@/components/settings/rename-workspace-form";
import {
  TaxSettingsForm,
  type TaxSettingsFormProps,
} from "@/components/settings/tax-settings-form";
import { ImportWizard, type ImportResult } from "@/components/import/import-wizard";
import { DoctrineCallout } from "./doctrine-callout";
import { FlowMap } from "./flow-map";
import { SeedListsStep, type SeedListsEmptiness } from "./seed-lists-step";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEP_LABELS,
  nextStep,
  previousStep,
  stepNumber,
  type OnboardingStateView,
} from "@/lib/onboarding/steps";
import {
  advanceOnboarding,
  completeOnboarding,
  dismissOnboarding,
  openOnboarding,
  reopenOnboarding,
} from "@/lib/onboarding/actions";
import type { OnboardingStep } from "@/types/entities";
import { cn } from "@/lib/utils";

export type OnboardingWizardProps = {
  initialState: OnboardingStateView;
  workspaceName: string;
  tax: TaxSettingsFormProps;
  seedEmpty: SeedListsEmptiness;
  importStatus: {
    blocked: boolean;
    blockedReason: "imported" | "has_deals";
    dealCount: number;
    lastImportName: string | null;
  };
};

const STEP_TITLES: Record<OnboardingStep, string> = {
  basics: "Your workspace",
  tax_review: "Your tax settings",
  seed_lists: "Your starting lists",
  migration_fork: "Bring your data in — or start fresh",
  first_deal: "Your first deal",
};

const STEP_INTROS: Record<OnboardingStep, string> = {
  basics:
    "This is your book of business. Name it, see how the pieces fit together, then read the one idea the whole tool is built on.",
  tax_review:
    "These are the defaults every computation uses. Review them — especially the EWT rate — and confirm whether you are VAT-registered.",
  seed_lists:
    "Start from the workbook's example lists, or skip and add your own. Nothing is added until you press the button.",
  migration_fork:
    "If you already keep a v30.x ZETA workbook, import it — your deals, payments, statuses and notes come across. Otherwise, start fresh.",
  first_deal:
    "A guided, typed-along first deal so you learn the form on a clearly-marked sample.",
};

export function OnboardingWizard({
  initialState,
  workspaceName,
  tax,
  seedEmpty,
  importStatus,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(initialState.current_step);
  const [, startTransition] = useTransition();
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // FR-M10-01 / rule 7: entering the wizard activates it. A not_started
  // workspace auto-opens once (so the dashboard redirect never fires again); a
  // dismissed or completed one re-opens (Settings → Setup assistant re-run).
  // Runs once on mount — the status here is the server snapshot.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const status = initialState.status;
    startTransition(async () => {
      if (status === "not_started") await openOnboarding();
      else if (status === "dismissed" || status === "completed") await reopenOnboarding();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIndex = ONBOARDING_STEPS.indexOf(step);

  /** Move to a step and persist it (resumability), logging completed/skipped. */
  const goTo = (to: OnboardingStep, options?: { skipped?: boolean }) => {
    const from = step;
    setStep(to);
    setConfirmingDismiss(false);
    startTransition(async () => {
      await advanceOnboarding(from, to, { skipped: options?.skipped });
    });
  };

  const finish = (stepData?: Record<string, unknown>) => {
    setFinished(true);
    startTransition(async () => {
      await completeOnboarding(stepData);
    });
  };

  const confirmDismiss = () => {
    startTransition(async () => {
      await dismissOnboarding();
      router.push(ROUTES.dashboard);
    });
  };

  const handleImportComplete = (result: ImportResult | undefined) => {
    if (result) setImportResult(result);
    // Persist that the import path was taken; keep the wizard on the fork step
    // so the "skip the walkthrough" offer (FR-M10-05) renders next to the result.
    startTransition(async () => {
      await advanceOnboarding("migration_fork", "migration_fork", {
        stepData: { fork: "import", imported: true },
      });
    });
  };

  if (finished) {
    return <CompletionScreen />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="onboarding-wizard">
      <Stepper currentIndex={currentIndex} onJump={(to) => goTo(to)} />

      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold sm:text-2xl">
          {STEP_TITLES[step]}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">{STEP_INTROS[step]}</p>
      </div>

      <div className="space-y-6">
        {step === "basics" && (
          <div className="space-y-6" data-testid="onboarding-step-basics">
            <SectionCard title="Name your workspace">
              <RenameWorkspaceForm currentName={workspaceName} />
            </SectionCard>
            <SectionCard title="How the pieces fit together">
              <FlowMap />
            </SectionCard>
            <DoctrineCallout
              articleKey="philosophy"
              placement="wizard.philosophy"
              popoverLabel="About the product philosophy"
              tone="primary"
              testId="philosophy-interstitial"
            />
          </div>
        )}

        {step === "tax_review" && (
          <div className="space-y-6" data-testid="onboarding-step-tax">
            <DoctrineCallout
              articleKey="ewt-5-option"
              placement="wizard.tax-review"
              popoverLabel="About the EWT 5% option"
              tone="primary"
              testId="ewt-5-callout"
            />
            <SectionCard title="Review your tax settings">
              <TaxSettingsForm settings={tax.settings} affectedDeals={tax.affectedDeals} />
            </SectionCard>
          </div>
        )}

        {step === "seed_lists" && (
          <div data-testid="onboarding-step-seed">
            <SeedListsStep empty={seedEmpty} />
          </div>
        )}

        {step === "migration_fork" && (
          <div className="space-y-6" data-testid="onboarding-step-fork">
            {/* Rule 16: the philosophy is shown before the fork so the import-vs-
                fresh choice is made understanding what the tool does. */}
            <DoctrineCallout
              articleKey="philosophy"
              placement="wizard.philosophy"
              popoverLabel="About the product philosophy"
              testId="philosophy-before-fork"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <ForkCard
                recommended
                title="Import your v30.x workbook"
                body="Your deals, payments, statuses and notes come across; every recomputed figure is reconciled to your sheet within ₱0.01."
                actionLabel="Import your workbook"
                onClick={() => setShowImporter(true)}
                testId="fork-import"
              />
              <ForkCard
                title="Start fresh"
                body="No workbook to import? Begin with an empty book and learn the flow on a guided sample deal."
                actionLabel="Start fresh"
                onClick={() => goTo("first_deal")}
                testId="fork-fresh"
              />
            </div>

            {showImporter && (
              <SectionCard title="Import workbook">
                <ImportWizard
                  blocked={importStatus.blocked}
                  blockedReason={importStatus.blockedReason}
                  dealCount={importStatus.dealCount}
                  lastImportName={importStatus.lastImportName}
                  onImportComplete={handleImportComplete}
                />
              </SectionCard>
            )}

            {importResult && (
              <div
                className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5"
                data-testid="import-skip-offer"
              >
                <div className="space-y-1">
                  <h3 className="font-heading text-base font-medium">
                    Your data&rsquo;s in — {importResult.deals} deals, {importResult.payments} payments
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You already have real records, so the sample walkthrough is
                    optional. Finish setup and head to your dashboard, or take the
                    guided sample deal anyway.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button data-testid="import-skip-finish" onClick={() => finish({ fork: "import" })}>
                    Finish setup
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="import-skip-walkthrough"
                    onClick={() => goTo("first_deal")}
                  >
                    Do the sample walkthrough
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "first_deal" && (
          <div data-testid="onboarding-step-first-deal">
            <FirstDealStub />
          </div>
        )}
      </div>

      <Footer
        step={step}
        onBack={() => goTo(previousStep(step))}
        onSkip={() => goTo(nextStep(step), { skipped: true })}
        onContinue={() => goTo(nextStep(step))}
        onFinish={() => finish()}
      />

      <DismissBar
        confirming={confirmingDismiss}
        onAsk={() => setConfirmingDismiss(true)}
        onCancel={() => setConfirmingDismiss(false)}
        onConfirm={confirmDismiss}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stepper({
  currentIndex,
  onJump,
}: {
  currentIndex: number;
  onJump: (step: OnboardingStep) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" data-testid="onboarding-stepper">
      {ONBOARDING_STEPS.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              // Earlier steps are revisitable (rule 7); later ones wait their turn.
              disabled={i > currentIndex}
              onClick={() => onJump(s)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                current && "border-primary bg-primary/10 text-primary",
                done && "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10",
                !current && !done && "text-muted-foreground",
                i > currentIndex && "cursor-default opacity-60",
              )}
              data-testid={`stepper-${s}`}
              aria-current={current ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full text-[10px]",
                  current ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {done ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              <span className="hidden sm:inline">{ONBOARDING_STEP_LABELS[s]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="font-heading text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

function ForkCard({
  title,
  body,
  actionLabel,
  onClick,
  recommended,
  testId,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onClick: () => void;
  recommended?: boolean;
  testId: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-5",
        recommended && "border-primary/40 bg-primary/5",
      )}
      data-testid={testId}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-heading text-base font-medium">{title}</h3>
          {recommended && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              Recommended
            </span>
          )}
        </div>
        <p className="text-sm text-pretty text-muted-foreground">{body}</p>
      </div>
      <div className="mt-auto">
        <Button
          variant={recommended ? "default" : "outline"}
          onClick={onClick}
          data-testid={`${testId}-button`}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function Footer({
  step,
  onBack,
  onSkip,
  onContinue,
  onFinish,
}: {
  step: OnboardingStep;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const isFirst = step === "basics";
  const isFork = step === "migration_fork";
  const isLast = step === "first_deal";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <Button
        variant="ghost"
        onClick={onBack}
        disabled={isFirst}
        data-testid="onboarding-back"
      >
        <ChevronLeft aria-hidden />
        Back
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        {!isFirst && !isLast && (
          <Button variant="ghost" onClick={onSkip} data-testid="onboarding-skip">
            Skip
          </Button>
        )}
        {isLast ? (
          <Button onClick={onFinish} data-testid="onboarding-finish">
            Finish setup
          </Button>
        ) : isFork ? (
          <Button variant="outline" onClick={onSkip} data-testid="onboarding-skip-fork">
            Skip for now
          </Button>
        ) : (
          <Button onClick={onContinue} data-testid="onboarding-continue">
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function DismissBar({
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <div className="flex justify-center">
        <Button
          variant="link"
          className="text-xs text-muted-foreground"
          onClick={onAsk}
          data-testid="onboarding-dismiss"
        >
          Set up later
        </Button>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-lg border bg-muted/40 p-4 text-center"
      data-testid="onboarding-dismiss-confirm"
    >
      <p className="text-sm text-pretty text-muted-foreground">
        You can stop here — the whole app works without finishing setup, and you
        can pick this back up any time from <span className="font-medium">Settings → Setup assistant</span>.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={onCancel} data-testid="onboarding-dismiss-cancel">
          Keep setting up
        </Button>
        <Button onClick={onConfirm} data-testid="onboarding-dismiss-confirm-button">
          Set up later
        </Button>
      </div>
    </div>
  );
}

function CompletionScreen() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6"
      data-testid="onboarding-complete"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="size-5 text-emerald-600" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">You&rsquo;re set up</h1>
          <p className="text-sm text-muted-foreground">
            Your workspace is ready. Here are the three things you do most —
            start with whichever fits your Monday.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />} data-testid="complete-log-deal">
          Log a deal
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={ROUTES.paymentNew} />}
          data-testid="complete-log-payment"
        >
          Log a payment
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={ROUTES.dashboard} />}
          data-testid="complete-dashboard"
        >
          Open the dashboard
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The getting-started checklist and the guided first-deal walkthrough arrive
        with the next update. You can re-open this assistant any time from
        Settings → Setup assistant.
      </p>
    </div>
  );
}

function FirstDealStub() {
  return (
    <div className="space-y-4 rounded-xl border border-dashed p-6 text-center" data-testid="first-deal-stub">
      <p className="text-sm font-medium">
        Step {stepNumber("first_deal")} of {ONBOARDING_STEP_COUNT} — the guided
        first-deal walkthrough
      </p>
      <p className="mx-auto max-w-md text-sm text-pretty text-muted-foreground">
        The typed-along sample deal — with coach-marks explaining each computed
        figure as it appears — is coming in the next update. For now you can log a
        real deal directly, or finish setup and explore.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />} data-testid="first-deal-log">
          Log a deal now
        </Button>
      </div>
    </div>
  );
}
