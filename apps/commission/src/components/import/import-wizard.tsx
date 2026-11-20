"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/lib/routes";
import { CONFIRMATION_FIELD } from "@/lib/friction/gate";
import { IDLE } from "@/lib/forms/action-state";
import {
  IMPORT_CONFIRM_PHRASE,
  IMPORT_INTENT_FIELD,
} from "@/lib/import/constants";
import { importAction, type ImportActionState } from "@/lib/import/actions";
import { ImportSummary } from "./import-summary";

export type ImportResult = {
  deals: number;
  payments: number;
  overlays: number;
  next_deal_code: string;
};

export type ImportWizardProps = {
  /** The workspace already has deals / a prior import — the upload flow is hidden. */
  blocked: boolean;
  /** Which message the blocked panel shows. */
  blockedReason: "imported" | "has_deals";
  dealCount: number;
  lastImportName: string | null;
  /**
   * M10.2: fired once when the import commits successfully. The first-run wizard
   * embeds this component in its migration-fork step and uses this to advance the
   * wizard (import success → offer to skip the sample walkthrough, FR-M10-05).
   * Omitted on the standalone /deals/import page — the component is unchanged there.
   */
  onImportComplete?: (result: ImportResult | undefined) => void;
};

/**
 * M1.4 — the importer wizard (FR-M1-10). One flow: upload → dry-run preview →
 * typed confirmation → import.
 *
 * WHY MANUAL DISPATCH, NOT `<form action>`. React resets an uncontrolled form
 * after a form action resolves, which would clear the file input between the dry
 * run and the real run and force a re-upload. So the file is held in React state
 * and both submits build their own FormData from it — the same file drives the
 * preview and the import. The typed-confirmation gate is still enforced
 * SERVER-SIDE (runImport → checkConfirmation); the disabled button is only a
 * courtesy.
 */
export function ImportWizard({
  blocked,
  blockedReason,
  dealCount,
  lastImportName,
  onImportComplete,
}: ImportWizardProps) {
  const [state, dispatch] = useActionState<ImportActionState, FormData>(
    importAction,
    IDLE
  );
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [typed, setTyped] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmId = useId();

  const done = state.done === true;

  // M10.2: notify the embedding wizard exactly once when the import commits.
  // Keyed on `done` so it fires on the transition, not on every render.
  useEffect(() => {
    if (done) onImportComplete?.(state.result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const plan = state.plan;
  const canImport = plan !== undefined && plan.mismatches.length === 0 && !done;
  const confirmSatisfied = typed.trim() === IMPORT_CONFIRM_PHRASE;

  function submit(intent: "dry" | "run") {
    if (!file) return;
    const fd = new FormData();
    fd.set("workbook", file);
    fd.set(IMPORT_INTENT_FIELD, intent);
    if (intent === "run") fd.set(CONFIRMATION_FIELD, typed);
    startTransition(() => dispatch(fd));
  }

  if (done) {
    return (
      <div
        data-testid="import-done"
        className="space-y-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden />
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-medium">Workbook imported</h2>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        </div>
        {plan && <ImportSummary plan={plan} />}
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={ROUTES.deals} />}>
            View your deals
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={ROUTES.collectibles} />}
          >
            View receivables
          </Button>
        </div>
      </div>
    );
  }

  // Blocked (already imported / already has deals) — but a just-finished import
  // above wins, so the agent always sees their success first. Kept in the client
  // component so the `done` panel survives the route refresh a server action triggers.
  if (blocked) {
    return (
      <div
        data-testid="import-blocked"
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="space-y-2">
            <h2 className="font-heading text-base font-medium">
              {blockedReason === "imported"
                ? "This workbook is already imported"
                : "This workspace already has deals"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {blockedReason === "imported"
                ? `A workbook was imported into this workspace${
                    lastImportName ? ` (${lastImportName})` : ""
                  }. The importer preserves deal codes, so it runs only once, on a fresh workspace.`
                : `You already have ${dealCount} deal${
                    dealCount === 1 ? "" : "s"
                  }. The importer preserves the workbook's codes, so it only runs on an empty workspace — log new deals directly instead.`}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button nativeButton={false} render={<Link href={ROUTES.deals} />}>
                Go to your deals
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={ROUTES.dealNew} />}>
                Log a deal
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="rounded-xl border p-5">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1 space-y-3">
            <div>
              <Label htmlFor="workbook-file">ZETA workbook (.xlsx)</Label>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Export your v30.x ZETA Google Sheet to Excel (.xlsx) and choose it here. Deals keep
                their original codes; nothing is written until you confirm.
              </p>
            </div>
            <Input
              id="workbook-file"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              data-testid="import-file"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setTyped("");
              }}
              className="cursor-pointer"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                data-testid="import-dry-run"
                disabled={!file || pending}
                onClick={() => submit("dry")}
              >
                <Upload aria-hidden />
                {pending && !canImport ? "Reading…" : plan ? "Re-run dry run" : "Preview (dry run)"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {state.error && (
        <p role="alert" data-testid="import-error" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {!state.error && state.message && (
        <p data-testid="import-message" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}

      {/* Dry-run summary + typed confirmation */}
      {plan && (
        <div className="space-y-6">
          <ImportSummary plan={plan} />

          {canImport && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="space-y-1">
                <h3 className="font-heading text-base font-medium">Import this workbook</h3>
                <p className="text-sm text-muted-foreground">
                  This writes all {plan.counts.deals} deals, {plan.counts.payments} payments and{" "}
                  {plan.counts.overlays} collectible states in one transaction. It runs once — the
                  same file cannot be imported twice.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={confirmId}>
                  Type <span className="font-medium">{IMPORT_CONFIRM_PHRASE}</span> to confirm
                </Label>
                <Input
                  id={confirmId}
                  data-testid="import-confirm-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="max-w-xs"
                />
              </div>
              <Button
                type="button"
                data-testid="import-run"
                disabled={!confirmSatisfied || pending}
                onClick={() => submit("run")}
              >
                {pending ? "Importing…" : "Import workbook"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
