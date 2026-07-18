"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { setNextActionNote } from "@/lib/receivables/actions";
import { IDLE } from "@/lib/forms/action-state";
import { cn } from "@/lib/utils";

/**
 * Section 8's inline Next Action editor (FR-M6-10) — the ONE write path in the whole
 * dashboard. A blue-input textarea (M0's editable affordance) that saves on blur, and
 * on an explicit thumb-friendly "Save" for the mobile chase-first surface. The write
 * goes through the AUDITED set_next_action_note RPC (via the shared server action), so
 * the note and its old→new audit entry are the very same field the M4 receivable
 * detail view edits — one source, provably.
 *
 * A note is not money-restating, so there is no ConfirmGate (rule 16) — but the write
 * is still audited. Optimistic feel: the typed text is never reverted; a spinner marks
 * the in-flight save and a ✓ marks success.
 *
 * CONCURRENT EDITS (handled gracefully). The RPC is last-write-wins by design (a plain
 * audited edit). When another surface (the receivable detail view, a second tab) edits
 * the same note, the dashboard revalidates and this row re-renders with a fresh
 * `initialNote`. If the field is idle and undirtied, we silently adopt that newer truth;
 * if the user has an unsaved divergent draft, we keep their draft but flag that the
 * stored note moved under them — their Save still lands (and audits), converging state.
 */
export function ChaseNoteEditor({
  receivableId,
  dealCode,
  initialNote,
}: {
  receivableId: string;
  dealCode: string;
  initialNote: string | null;
}) {
  const serverNote = initialNote ?? "";
  const [state, formAction, pending] = useActionState(setNextActionNote, IDLE);
  const [note, setNote] = useState(serverNote);
  // The last value we know the server holds — moves on our own successful save and on
  // an adopted external change. `dirty` = the user has typed something not yet stored.
  const [baseline, setBaseline] = useState(serverNote);
  const formRef = useRef<HTMLFormElement>(null);
  const editing = useRef(false);

  const dirty = note !== baseline;
  // The stored note changed elsewhere while we hold a divergent draft (rule 16 / graceful).
  const conflicted = serverNote !== baseline && note !== serverNote;

  // Reconcile a concurrent external edit: adopt the newer server note only when the
  // user is not mid-edit and has nothing unsaved (else we'd clobber their draft).
  useEffect(() => {
    if (serverNote !== baseline && !editing.current && note === baseline) {
      setNote(serverNote);
      setBaseline(serverNote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverNote]);

  // On a successful save, pin the baseline to what we sent so "Saved ✓" sticks and the
  // reconciliation above becomes a no-op once revalidation brings the matching prop.
  useEffect(() => {
    if (!pending && state.message && !state.error) setBaseline(note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending]);

  const save = () => {
    if (!dirty || pending) return;
    formRef.current?.requestSubmit();
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-1.5">
      <input type="hidden" name="id" value={receivableId} />
      <label htmlFor={`chase-note-${dealCode}`} className="sr-only">
        Next action for {dealCode}
      </label>
      <textarea
        id={`chase-note-${dealCode}`}
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onFocus={() => (editing.current = true)}
        onBlur={(e) => {
          editing.current = false;
          // Don't double-fire when focus moves to this form's own Save button.
          if (e.relatedTarget && formRef.current?.contains(e.relatedTarget as Node)) return;
          save();
        }}
        rows={2}
        maxLength={500}
        placeholder="e.g. Called CLI — releasing Aug 15"
        data-testid={`chase-note-${dealCode}`}
        className={cn(
          "flex min-h-9 w-full resize-y rounded-md border px-2.5 py-1.5 text-sm",
          "border-affordance-input-border bg-affordance-input text-affordance-input-foreground",
          "placeholder:text-affordance-input-foreground/50",
          "focus-visible:border-affordance-input-ring focus-visible:ring-2 focus-visible:ring-affordance-input-ring/40 focus-visible:outline-none",
          "dark:bg-affordance-input"
        )}
      />

      <div className="flex min-h-5 items-center justify-between gap-2 text-xs">
        <span aria-live="polite" className="flex items-center gap-1">
          {pending ? (
            <span className="flex items-center gap-1 text-muted-foreground" data-testid={`chase-note-status-${dealCode}`}>
              <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Saving…
            </span>
          ) : state.error ? (
            <span className="flex items-center gap-1 text-destructive" data-testid={`chase-note-status-${dealCode}`}>
              <TriangleAlert className="size-3" aria-hidden="true" /> {state.error}
            </span>
          ) : conflicted ? (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300" data-testid={`chase-note-status-${dealCode}`}>
              <TriangleAlert className="size-3" aria-hidden="true" /> Changed elsewhere — saving keeps yours.
            </span>
          ) : state.message && !dirty ? (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300" data-testid={`chase-note-status-${dealCode}`}>
              <Check className="size-3" aria-hidden="true" /> Saved
            </span>
          ) : (
            <span className="text-muted-foreground">
              {dirty ? "Unsaved" : "Saves on blur"}
            </span>
          )}
        </span>
        <button
          type="submit"
          disabled={!dirty || pending}
          data-testid={`chase-note-save-${dealCode}`}
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 font-medium transition-colors",
            dirty && !pending
              ? "border-primary/40 text-primary hover:bg-primary/10"
              : "border-transparent text-muted-foreground/50"
          )}
        >
          Save
        </button>
      </div>
    </form>
  );
}
