import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * M2 yield-aggregate consumer — the app half of the cursor-based projection (M2.2).
 *
 * deal_event is an append-only log with several independent consumers, each tracking
 * its OWN cursor (m1_2 handoff). M2's cursor is yield_event_cursor — distinct from
 * M4's receivable_event_cursor — and the drain is the DB function consume_yield_events:
 * it reads events after the cursor and recomputes each deal's affected (segment, year)
 * yield_aggregate cells absolutely from the current deal rows (create / edit / archive
 * / restore, including segment/year moves). The function is idempotent (per-cell
 * re-aggregation) and resumable (the cursor), so this wrapper simply calls it in a
 * loop until a batch comes back empty.
 *
 * MONOLITH-FIRST (Master PRD §6). No queue infrastructure: the deal actions, the bulk
 * recompute runner and the importer call this synchronously right after they write —
 * the same seams the M4 receivable consumer uses — so a deal is never booked without
 * its yield cells restated (≤2 s target met trivially: a synchronous drain is ms).
 * Because the cursor catches up whatever is pending, a call also heals any events a
 * prior run missed.
 */

// One batch covers the whole workbook (21 deals) and any realistic single-request
// fan-out; the loop keeps draining if a bulk recompute produced more.
const BATCH_SIZE = 500;

// A safety ceiling so a logic bug can never spin forever (matches the receivable
// consumer). Reaching it leaves the cursor resumable.
const MAX_BATCHES = 500;

/**
 * Drain M2's deal-event cursor for the caller's workspace to completion. Returns the
 * number of events projected. Call after every deal mutation, after each bulk
 * recompute, and after the workbook import — so the materialized yield aggregates
 * restate in the same request the deal moved.
 */
export async function consumeYieldEvents(): Promise<number> {
  const supabase = await createClient();
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const { data, error } = await supabase.rpc("consume_yield_events", {
      p_limit: BATCH_SIZE,
    });
    if (error) {
      throw new Error(`Could not sync yield aggregates: ${error.message}`);
    }
    const processed =
      (data as unknown as { processed?: number })?.processed ?? 0;
    total += processed;
    if (processed === 0) break;
  }
  return total;
}
