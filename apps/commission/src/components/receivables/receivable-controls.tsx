"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Pencil, SlidersHorizontal, Wallet, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputField } from "@/components/affordance/input-field";
import { FormStatus } from "@/components/forms/form-status";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { HelpPopover } from "@/components/help/help-popover";
import { useHelpContent } from "@/components/help/help-content-provider";
import { Markdown } from "@/lib/help/markdown";
import { correctionsCases } from "@/lib/help/corrections";
import {
  cancelReceivable,
  closeReceivable,
  reopenReceivable,
  setConfirmedCollectible,
  setNextActionNote,
} from "@/lib/receivables/actions";
import { IDLE } from "@/lib/forms/action-state";
import { formatPHP, toMoney } from "@/lib/money";
import { dealEditPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The receivable's editable surface (M4.4, §6): the three status transitions behind
 * friction-gated dialogs (Close/Cancel/Reopen), the Confirmed Collectible override
 * (with its required audit note), the Next Action note, and the "Adjust…" flow that
 * routes the Corrections doctrine's three cases (§3.3) to the right tool.
 *
 * Everything money-restating is gated server-side; the dialogs here are how the
 * confirmation token is collected. The override note is its own friction gate — the
 * save is refused without it (edge case 17). Kept as one client island so "Adjust…"
 * can reveal the override form (case 2) and open the Close dialog (case 3) without
 * cross-component wiring.
 */

export type ReceivableControlsProps = {
  id: string;
  dealCode: string;
  status: "open" | "closed" | "cancelled";
  version: number;
  balance: string | null;
  collectedNet: string;
  totalCollectible: string;
  defaultTotalCollectible: string;
  confirmedCollectible: string | null;
  nextActionNote: string | null;
};

/** A plain textarea styled to match the app's inputs (notes are ≤ 500 chars). */
function NoteTextarea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-16 w-full rounded-md border border-affordance-input-border bg-affordance-input px-3 py-2 text-sm",
        "text-affordance-input-foreground placeholder:text-affordance-input-foreground/50",
        "focus-visible:border-affordance-input-ring focus-visible:ring-2 focus-visible:ring-affordance-input-ring/40 focus-visible:outline-none",
        "dark:bg-affordance-input",
        props.className
      )}
    />
  );
}

export function ReceivableControls(props: ReceivableControlsProps) {
  const { id, dealCode, status, version, confirmedCollectible } = props;
  const isOpen = status === "open";
  const overridden = confirmedCollectible !== null;

  const [showOverride, setShowOverride] = useState(overridden);
  const [showAdjust, setShowAdjust] = useState(false);
  const overrideRef = useRef<HTMLDivElement>(null);

  const revealOverride = () => {
    setShowOverride(true);
    setShowAdjust(false);
    requestAnimationFrame(() =>
      overrideRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  return (
    <div className="space-y-5">
      {/* --- status actions + adjust ------------------------------------- */}
      <div className="flex flex-wrap gap-2">
        {isOpen ? (
          <>
            <Button
              variant="outline"
              onClick={() => setShowAdjust((o) => !o)}
              data-testid="adjust-toggle"
            >
              <SlidersHorizontal className="size-4" /> A number changed
            </Button>
            <CloseDialog {...props} />
            <CancelDialog {...props} />
          </>
        ) : (
          <ReopenDialog id={id} version={version} status={status} />
        )}
      </div>

      {/* --- the Corrections-doctrine mini-flow (FR-M10-13, P6) ---------- */}
      {isOpen && showAdjust && (
        <CorrectionsMiniFlow
          dealCode={dealCode}
          onConfirmCollectible={revealOverride}
          closeShort={
            <CloseDialog {...props} triggerLabel="Close short" triggerVariant="outline" small />
          }
        />
      )}

      {/* --- Confirmed Collectible override ------------------------------ */}
      <div ref={overrideRef}>
        {showOverride ? (
          <OverrideForm {...props} />
        ) : (
          <button
            type="button"
            onClick={() => setShowOverride(true)}
            className="text-sm text-primary hover:underline"
            data-testid="show-override"
          >
            Confirm a different collectible…
          </button>
        )}
      </div>

      {/* --- Next Action note ------------------------------------------- */}
      <NextActionNoteForm id={id} nextActionNote={props.nextActionNote} />
    </div>
  );
}

/**
 * The Corrections-doctrine mini-flow (FR-M10-13, AC7): "A number changed — which
 * case am I in?" Two yes/no questions route to exactly one of the doctrine's three
 * cases; each terminal case renders the P6 doctrine text VERBATIM (sliced from the
 * corrections-doctrine article, rule 12) beside the one action it prescribes:
 *   Q1 "economics actually changed?"  Yes → case 1 (edit the deal)
 *                                     No  → Q2
 *   Q2 "accept the different cash?"   Yes → case 2 (Confirmed Collectible + note)
 *                                     No  → case 3 (close short, let Variance tell it)
 * The full doctrine stays one "?" away via the P6 popover in the header.
 */
function CorrectionsMiniFlow({
  dealCode,
  onConfirmCollectible,
  closeShort,
}: {
  dealCode: string;
  onConfirmCollectible: () => void;
  closeShort: React.ReactNode;
}) {
  const help = useHelpContent();
  const glossary = help.glossary;
  const cases = correctionsCases(help.articleForPlacement("receivable.corrections"));

  // null = at Q1; 'yes'/'no' = Q1 answered (Q2 shown when 'no'); terminal cases
  // are derived from the pair of answers.
  const [q1, setQ1] = useState<null | "yes" | "no">(null);
  const [q2, setQ2] = useState<null | "yes" | "no">(null);

  const reset = () => {
    setQ1(null);
    setQ2(null);
  };

  const outcome =
    q1 === "yes" ? "case1" : q1 === "no" && q2 === "yes" ? "case2" : q1 === "no" && q2 === "no" ? "case3" : null;

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm" data-testid="adjust-panel">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">A number changed — which case am I in?</p>
        <HelpPopover
          placement="receivable.corrections"
          label="About the Collectible Corrections doctrine"
          testId="help-receivable-corrections"
        />
      </div>

      {/* Q1 */}
      <div className="space-y-2" data-testid="adjust-q1">
        <p className="text-muted-foreground">
          Did the contract or economics actually change — price amended, rate renegotiated before
          release, or the wrong base (and the contract backs the developer)?
        </p>
        <div className="flex gap-2">
          <Button
            variant={q1 === "yes" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setQ1("yes");
              setQ2(null);
            }}
            data-testid="adjust-q1-yes"
          >
            Yes
          </Button>
          <Button
            variant={q1 === "no" ? "default" : "outline"}
            size="sm"
            onClick={() => setQ1("no")}
            data-testid="adjust-q1-no"
          >
            No
          </Button>
        </div>
      </div>

      {/* Q2 — only once Q1 = No */}
      {q1 === "no" && (
        <div className="space-y-2 border-t pt-3" data-testid="adjust-q2">
          <p className="text-muted-foreground">
            The earnings stand, but the expected cash differs. Do you accept that different amount?
          </p>
          <div className="flex gap-2">
            <Button
              variant={q2 === "yes" ? "default" : "outline"}
              size="sm"
              onClick={() => setQ2("yes")}
              data-testid="adjust-q2-yes"
            >
              Yes — I accept it
            </Button>
            <Button
              variant={q2 === "no" ? "default" : "outline"}
              size="sm"
              onClick={() => setQ2("no")}
              data-testid="adjust-q2-no"
            >
              No — it&apos;s a shortfall I dispute
            </Button>
          </div>
        </div>
      )}

      {/* Terminal case — verbatim doctrine + the one prescribed action */}
      {outcome === "case1" && (
        <CaseResult testId="adjust-case-1" doctrine={cases.case1} glossary={glossary}>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={dealEditPath(dealCode)} />}
            data-testid="adjust-edit-deal"
          >
            <Pencil className="size-4" /> Edit the deal
          </Button>
        </CaseResult>
      )}
      {outcome === "case2" && (
        <CaseResult testId="adjust-case-2" doctrine={cases.case2} glossary={glossary}>
          <Button variant="outline" size="sm" onClick={onConfirmCollectible} data-testid="adjust-confirm-collectible">
            <Wallet className="size-4" /> Confirm a different collectible
          </Button>
        </CaseResult>
      )}
      {outcome === "case3" && (
        <CaseResult testId="adjust-case-3" doctrine={cases.case3} glossary={glossary}>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <XCircle className="size-4" />
            {closeShort}
          </span>
        </CaseResult>
      )}

      {outcome !== null && (
        <button
          type="button"
          onClick={reset}
          className="text-xs text-primary hover:underline"
          data-testid="adjust-restart"
        >
          Start over
        </button>
      )}
    </div>
  );
}

/** One terminal case: the verbatim doctrine text above its single prescribed action. */
function CaseResult({
  testId,
  doctrine,
  glossary,
  children,
}: {
  testId: string;
  doctrine: string;
  glossary: React.ComponentProps<typeof Markdown>["glossary"];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-background p-3" data-testid={testId}>
      <Markdown body={doctrine} glossary={glossary} />
      <div>{children}</div>
    </div>
  );
}

/**
 * The Closed-vs-Cancelled doctrine (P8, §6.3), rendered VERBATIM inside the
 * status-change dialogs (AC8). The status dialog is P8's exact placement surface —
 * the doctrine shows in-flow, not one popover away, because it is the rule the
 * agent is about to act on. The "?" keeps it addressable for instrumentation.
 */
function StatusDoctrine() {
  const help = useHelpContent();
  const article = help.articleForPlacement("receivable.status-dialog");
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="status-doctrine-p8">
      <div className="flex items-center gap-1">
        <p className="font-medium">Closed vs Cancelled</p>
        <HelpPopover
          placement="receivable.status-dialog"
          label="About Closed vs Cancelled"
          testId="help-receivable-status-dialog"
        />
      </div>
      <Markdown body={article.bodyMd} glossary={help.glossary} />
    </div>
  );
}

// --- Close dialog -----------------------------------------------------------

function CloseDialog({
  id,
  version,
  balance,
  collectedNet,
  totalCollectible,
  triggerLabel = "Close",
  triggerVariant = "default",
  small = false,
}: ReceivableControlsProps & {
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  small?: boolean;
}) {
  const variance = toMoney(collectedNet).minus(toMoney(totalCollectible));
  const nonZeroBalance = balance !== null && !toMoney(balance).isZero();
  const varianceCopy = variance.isZero()
    ? "Collected in full — variance ₱0.00."
    : variance.isNegative()
      ? `Closing with variance ${formatPHP(variance.toFixed(2))} — the shortfall stays visible in your %-collected stats.`
      : `Over-collected by ${formatPHP(variance.toFixed(2))} — recorded as positive variance.`;

  return (
    <ConfirmGate
      trigger={
        <Button variant={triggerVariant} size={small ? "sm" : "default"} data-testid="close-trigger">
          {triggerLabel}
        </Button>
      }
      title={`Close this receivable?`}
      description="The payor has finished paying. The balance stops being 'owed' and becomes Variance (Rule N). Reopen later if this was premature."
      consequence={
        <span data-testid="close-variance-preview">
          {nonZeroBalance
            ? `Balance is ${formatPHP(balance!)} — not fully collected. ${varianceCopy}`
            : varianceCopy}
        </span>
      }
      gate={{ mode: "checked" }}
      confirmLabel="Close receivable"
      action={closeReceivable}
      testId="close-gate"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedVersion" value={version} />
      <StatusDoctrine />
    </ConfirmGate>
  );
}

// --- Cancel dialog ----------------------------------------------------------

function CancelDialog({
  id,
  version,
  collectedNet,
  totalCollectible,
}: ReceivableControlsProps) {
  const writeOff = toMoney(totalCollectible).minus(toMoney(collectedNet));

  return (
    <ConfirmGate
      trigger={
        <Button variant="destructive" data-testid="cancel-trigger">
          Cancel
        </Button>
      }
      title="Cancel this receivable?"
      description="The deal died — the buyer backed out or the developer cancelled the sale. The uncollected remainder is written off; cash already collected is kept."
      consequence={
        <span data-testid="cancel-writeoff-preview">
          {formatPHP(writeOff.isNegative() ? "0.00" : writeOff.toFixed(2))} will be written off; cash
          already collected ({formatPHP(collectedNet)}) is kept.
        </span>
      }
      gate={{ mode: "checked" }}
      confirmLabel="Cancel receivable"
      action={cancelReceivable}
      destructive
      testId="cancel-gate"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedVersion" value={version} />
      <StatusDoctrine />
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">Why are you cancelling?</Label>
        {/* Not HTML5-`required`: the server is the safeguard (§3.2) — an empty
            reason reaches the action and comes back with the doctrine message. */}
        <NoteTextarea
          id="cancel-reason"
          name="reason"
          maxLength={500}
          placeholder="e.g. Buyer withdrew — developer confirmed the reservation is void."
          data-testid="cancel-reason"
        />
        <p className="text-xs text-muted-foreground">
          Required — the reason is the write-off&apos;s audit trail.
        </p>
      </div>
    </ConfirmGate>
  );
}

// --- Reopen dialog ----------------------------------------------------------

function ReopenDialog({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: "closed" | "cancelled" | "open";
}) {
  return (
    <ConfirmGate
      trigger={
        <Button variant="outline" data-testid="reopen-trigger">
          Reopen
        </Button>
      }
      title="Reopen this receivable?"
      description={
        status === "cancelled"
          ? "A written-off deal has revived. Reopening clears the write-off and resumes balance and aging tracking."
          : "This was closed. Reopening clears the frozen variance and resumes balance and aging tracking — e.g. a late payment is coming in."
      }
      gate={{ mode: "checked" }}
      confirmLabel="Reopen receivable"
      action={reopenReceivable}
      testId="reopen-gate"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedVersion" value={version} />
    </ConfirmGate>
  );
}

// --- Confirmed Collectible override -----------------------------------------

function OverrideForm({
  id,
  defaultTotalCollectible,
  confirmedCollectible,
}: ReceivableControlsProps) {
  const [state, formAction, pending] = useActionState(setConfirmedCollectible, IDLE);
  const [clearState, clearAction, clearPending] = useActionState(setConfirmedCollectible, IDLE);
  const [amount, setAmount] = useState(confirmedCollectible ?? "");

  return (
    <div className="space-y-3 rounded-xl border p-4" data-testid="override-panel">
      <div>
        <h3 className="font-medium">Confirmed Collectible</h3>
        <p className="text-xs text-muted-foreground">
          The booked default is {formatPHP(defaultTotalCollectible)}. Enter a confirmed figure only
          when you accept a different cash amount — always say why (the note is its audit trail).
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <div className="space-y-1.5">
          <Label htmlFor="override-amount">Confirmed amount (₱)</Label>
          <InputField
            id="override-amount"
            name="confirmedCollectible"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={defaultTotalCollectible}
            data-testid="override-amount"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-note">Note (why)</Label>
          <NoteTextarea
            id="override-note"
            name="note"
            maxLength={500}
            placeholder='e.g. "CLI advice 7/20: base excl. promo disc — confirmed 303,806"'
            data-testid="override-note"
          />
        </div>
        <Button type="submit" disabled={pending} data-testid="override-save">
          {pending ? "Saving…" : "Save confirmed collectible"}
        </Button>
      </form>

      <FormStatus state={state} />

      {confirmedCollectible !== null && (
        <form action={clearAction}>
          <input type="hidden" name="id" value={id} />
          {/* empty confirmedCollectible = clear back to the booked default */}
          <input type="hidden" name="confirmedCollectible" value="" />
          <input type="hidden" name="note" value="" />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={clearPending}
            data-testid="override-clear"
          >
            {clearPending ? "Clearing…" : "Clear override (revert to booked default)"}
          </Button>
        </form>
      )}
      {clearState.error && <FormStatus state={clearState} />}
    </div>
  );
}

// --- Next Action note -------------------------------------------------------

function NextActionNoteForm({
  id,
  nextActionNote,
}: {
  id: string;
  nextActionNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(setNextActionNote, IDLE);
  const [note, setNote] = useState(nextActionNote ?? "");

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <h3 className="font-medium">Next Action</h3>
        <p className="text-xs text-muted-foreground">
          Your follow-up for this receivable — it surfaces on the Dashboard chase list.
        </p>
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <NoteTextarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. Follow up with Ayala AR desk re: 3rd release"
          data-testid="next-action-note"
        />
        <Button type="submit" disabled={pending} variant="outline" data-testid="next-action-save">
          {pending ? "Saving…" : "Save next action"}
        </Button>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
