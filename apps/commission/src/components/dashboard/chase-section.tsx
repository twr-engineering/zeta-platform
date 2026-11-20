import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { formatPHP } from "@/lib/money";
import { formatManilaDate } from "@/lib/date/manila";
import { collectibleDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { ChaseFollowUp, ChaseRow } from "@/lib/receivables/projections";
import type { ChaseSection as ChaseSectionData } from "@/lib/dashboard/sections";

import { DashboardSection } from "./section";
import { SectionExport } from "./section-export";
import { ChaseNoteEditor } from "./chase-note-editor";

/**
 * Section 8 — CHASE LIST (M6 §3.3, FR-M6-09/10). Every Open receivable with a balance,
 * ordered by the chase contract (balance DESC, months-idle DESC nulls-last, deal_code —
 * Rule Q, decided per OQ1). Nine columns; the last, Next Action, is INLINE-editable and
 * writes through to the audited M4 field — the module's only mutation. This is the
 * agent's Monday-morning working surface and THE mobile field surface (§6): the desktop
 * table collapses to a chase-first card stack that leads with balance + client +
 * follow-up + a thumb-editable note.
 *
 * ZERO client math: every peso is the server builder's string, every chip state is the
 * builder's `followUp` enum. The row's Deal ID (and, on mobile, the card header) drills
 * to the receivable detail — the same note lives there, provably one field.
 */

/** The follow-up chip (§6): grey "no payment yet", amber "⚠ chase", muted "ok". */
const FOLLOW_UP: Record<ChaseFollowUp, { label: string; className: string; testId: string }> = {
  no_payment_yet: {
    label: "no payment yet",
    className: "bg-muted text-muted-foreground",
    testId: "no_payment_yet",
  },
  chase: {
    label: "⚠ chase",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    testId: "chase",
  },
  ok: {
    label: "ok",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    testId: "ok",
  },
};

function FollowUpChip({ state }: { state: ChaseFollowUp }) {
  const chip = FOLLOW_UP[state];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        chip.className
      )}
      data-testid="chase-follow-up"
      data-follow-up={chip.testId}
    >
      {chip.label}
    </span>
  );
}

/** Months Idle = workbook col P (blank when Closed/Cancelled or never paid). */
function MonthsIdle({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{value}</span>;
}

/** Last Payment: the release date, or "—" when nothing has landed yet. */
function LastPayment({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className="whitespace-nowrap tabular-nums">{formatManilaDate(value)}</span>;
}

export function ChaseSection({ data }: { data: ChaseSectionData }) {
  const { rows, overThirtyWarning } = data;

  return (
    <DashboardSection
      index={8}
      id="chase"
      title="Chase List"
      description="Every open balance, largest first — who to chase today, with an inline follow-up note. The year filter does not touch this."
      testId="section-chase"
      action={rows.length > 0 ? <SectionExport dataset="dashboard-chase" label="chase list" /> : undefined}
    >
      {overThirtyWarning && (
        <p
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          data-testid="chase-over-thirty"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          Your chase list is longer than 30 — consider a collections sprint.
        </p>
      )}

      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center"
          data-testid="chase-empty"
        >
          <CircleCheck className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <h3 className="text-base font-semibold">Nothing to chase</h3>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            Every open balance is settled. New receivables show up here the moment a deal
            still owes you money.
          </p>
        </div>
      ) : (
        <>
          {/* desktop table (sticky first column, §6) */}
          <div className="hidden overflow-x-auto rounded-xl border ring-1 ring-foreground/5 lg:block">
            <table className="w-full text-sm" data-testid="chase-table">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2.5 font-medium">Deal ID</th>
                  <th className="px-3 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-2.5 text-right font-medium">Last Payment</th>
                  <th className="px-3 py-2.5 text-right font-medium">Months Idle</th>
                  <th className="px-3 py-2.5 font-medium">Follow up?</th>
                  <th className="px-3 py-2.5 font-medium">Developer</th>
                  <th className="px-3 py-2.5 text-right font-medium">Booked GCI</th>
                  <th className="min-w-[15rem] px-3 py-2.5 font-medium">Next Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ChaseTableRow key={row.receivableId} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile / tablet: the chase-first card stack — THE field surface (§6) */}
          <ul className="space-y-3 lg:hidden" data-testid="chase-cards">
            {rows.map((row) => (
              <ChaseCard key={row.receivableId} row={row} />
            ))}
          </ul>
        </>
      )}
    </DashboardSection>
  );
}

function DealLink({ row }: { row: ChaseRow }) {
  return (
    <Link
      href={collectibleDetailPath(row.dealCode)}
      className="font-medium text-primary hover:underline"
      data-testid={`chase-deal-link-${row.dealCode}`}
    >
      {row.dealCode}
    </Link>
  );
}

/** The overridden marker (§4 rule 13): Total Collectible is user-confirmed (blue). */
function BookedGci({ row }: { row: ChaseRow }) {
  return (
    <span className="tabular-nums">
      {formatPHP(row.bookedNetGci)}
      {row.overridden && (
        <span
          className="ml-1 text-xs text-affordance-input-foreground"
          title="Total Collectible is user-confirmed (overrides booked GCI)"
          data-testid={`chase-overridden-${row.dealCode}`}
        >
          ●
        </span>
      )}
    </span>
  );
}

function ChaseTableRow({ row }: { row: ChaseRow }) {
  return (
    <tr
      className="border-t align-top hover:bg-muted/40"
      data-testid="chase-row"
      data-deal={row.dealCode}
    >
      <td className="sticky left-0 z-10 bg-background px-3 py-2.5">
        <DealLink row={row} />
      </td>
      <td className="px-3 py-2.5">{row.clientName}</td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums" data-testid="chase-balance">
        {row.balance === null ? "—" : formatPHP(row.balance)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <LastPayment value={row.lastPaymentDate} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <MonthsIdle value={row.monthsIdle} />
      </td>
      <td className="px-3 py-2.5">
        <FollowUpChip state={row.followUp} />
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{row.developerName ?? "—"}</td>
      <td className="px-3 py-2.5 text-right">
        <BookedGci row={row} />
      </td>
      <td className="px-3 py-2.5">
        <ChaseNoteEditor
          receivableId={row.receivableId}
          dealCode={row.dealCode}
          initialNote={row.nextActionNote}
        />
      </td>
    </tr>
  );
}

/**
 * The mobile chase-first card (§6): balance + client lead, then the follow-up state,
 * then the thumb-editable Next Action — the four things the field user acts on. The
 * header links to the receivable detail; the note editor sits below as its own control.
 */
function ChaseCard({ row }: { row: ChaseRow }) {
  return (
    <li className="rounded-xl border p-3" data-testid="chase-card" data-deal={row.dealCode}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={collectibleDetailPath(row.dealCode)}
            className="font-medium text-primary hover:underline"
            data-testid={`chase-card-link-${row.dealCode}`}
          >
            {row.dealCode} · {row.clientName}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.developerName ?? "Resale / Rental"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums" data-testid="chase-balance">
            {row.balance === null ? "—" : formatPHP(row.balance)}
          </div>
          <div className="mt-0.5">
            <FollowUpChip state={row.followUp} />
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>Last payment</span>
        <span>Months idle</span>
        <span className="text-right">Booked GCI</span>
        <span className="text-foreground">
          <LastPayment value={row.lastPaymentDate} />
        </span>
        <span className="text-foreground">
          <MonthsIdle value={row.monthsIdle} />
        </span>
        <span className="text-right text-foreground">
          <BookedGci row={row} />
        </span>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Next Action</p>
        <ChaseNoteEditor
          receivableId={row.receivableId}
          dealCode={row.dealCode}
          initialNote={row.nextActionNote}
        />
      </div>
    </li>
  );
}
