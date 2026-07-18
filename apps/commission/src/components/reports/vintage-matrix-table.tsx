import { formatAmount, toMoney } from "@/lib/money";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VintageMatrix } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * M8.3 — Report 2 grid (§3.3 / §6): the paid-year × booking-year vintage matrix.
 * Rows = paid years (sticky first column), columns = booking years (sticky header
 * row), a row-total column and a TOTAL row. Cell styling encodes the vintage story:
 *
 *   • diagonal (paid = booked) — subtly shaded: cash arrived the year the deal closed.
 *   • below diagonal (paid > booked) — default: the pre-selling collection tail.
 *   • above diagonal (paid < booked) — muted warning tint + "paid before booking
 *     year" tooltip (rule 9: rendered as-is, never hidden; flagging is M6's job).
 *
 * Zero cells render "—" for scanability (exports carry 0.00). Beyond ~10 columns the
 * table scrolls horizontally INSIDE its own container while the paid-year column
 * stays pinned. Every figure is the M8.2 aggregator's for the active toggle value.
 */
export function VintageMatrixTable({ matrix }: { matrix: VintageMatrix }) {
  const { bookedYears, rows, columnTotals, grandTotal } = matrix;

  return (
    <div
      className="overflow-x-auto rounded-xl border"
      data-testid="matrix-scroll"
    >
      <table className="border-separate border-spacing-0 text-sm" data-testid="matrix-table">
        <thead>
          <tr>
            {/* corner — sticky both axes */}
            <th className="sticky left-0 top-0 z-20 border-b border-r bg-muted/80 px-3 py-2 text-left text-xs font-medium text-muted-foreground backdrop-blur">
              Paid ↓ / Booked →
            </th>
            {bookedYears.map((by) => (
              <th
                key={by}
                className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-2 text-right text-xs font-medium backdrop-blur"
                data-testid="matrix-col-header"
                data-booked={by}
              >
                {by}
              </th>
            ))}
            <th className="sticky top-0 z-10 border-b border-l bg-muted/80 px-3 py-2 text-right text-xs font-semibold backdrop-blur">
              Row total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.yearPaid} data-testid="matrix-row" data-paid={row.yearPaid}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r bg-background px-3 py-2 text-left font-medium backdrop-blur"
              >
                {row.yearPaid}
              </th>
              {row.cells.map((cell, i) => {
                const booked = bookedYears[i];
                const rel: Cell =
                  row.yearPaid === booked
                    ? "diagonal"
                    : row.yearPaid < booked
                      ? "above"
                      : "below";
                return (
                  <MatrixCell
                    key={booked}
                    value={cell}
                    rel={rel}
                    paid={row.yearPaid}
                    booked={booked}
                  />
                );
              })}
              <td
                className="border-b border-l px-3 py-2 text-right font-semibold tabular-nums"
                data-testid="matrix-row-total"
                data-paid={row.yearPaid}
              >
                {dashOrAmount(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/50 font-semibold">
            <th
              scope="row"
              className="sticky left-0 z-10 border-r bg-muted/50 px-3 py-2.5 text-left backdrop-blur"
            >
              TOTAL
            </th>
            {columnTotals.map((ct, i) => (
              <td
                key={bookedYears[i]}
                className="border-t px-3 py-2.5 text-right tabular-nums"
                data-testid="matrix-col-total"
                data-booked={bookedYears[i]}
              >
                {dashOrAmount(ct)}
              </td>
            ))}
            <td
              className="border-l border-t px-3 py-2.5 text-right tabular-nums"
              data-testid="matrix-grand-total"
            >
              {dashOrAmount(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type Cell = "diagonal" | "above" | "below";

/** A money string of "0.00" renders as an em dash; otherwise grouped, no ₱ sign. */
function dashOrAmount(value: string): string {
  return toMoney(value).isZero() ? "—" : formatAmount(value);
}

function MatrixCell({
  value,
  rel,
  paid,
  booked,
}: {
  value: string;
  rel: Cell;
  paid: number;
  booked: number;
}) {
  const display = dashOrAmount(value);
  const base = "border-b px-3 py-2 text-right tabular-nums";
  const className = cn(
    base,
    rel === "diagonal" && "bg-muted/40",
    rel === "above" && "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
  );

  const cell = (
    <td
      className={className}
      data-testid="matrix-cell"
      data-paid={paid}
      data-booked={booked}
      data-rel={rel}
    >
      {display}
    </td>
  );

  // Above-diagonal cells (paid before the deal's booking year) carry the anomaly
  // tooltip. Rendered as-is regardless — M8 never hides real cash (rule 9).
  if (rel !== "above") return cell;

  return (
    <Tooltip>
      <TooltipTrigger render={cell} tabIndex={0} className="cursor-help" />
      <TooltipContent>paid before booking year</TooltipContent>
    </Tooltip>
  );
}
