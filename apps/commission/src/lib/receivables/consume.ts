import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * M4 receivable consumer — the app half of the cursor-based projection.
 *
 * deal_event is an append-only log with several independent consumers, each
 * tracking its OWN cursor (m1_2 handoff). M4's cursor is receivable_event_cursor
 * and the drain is the DB function consume_deal_events: it reads events after the
 * cursor and mirrors each deal's snapshot onto its receivable (create / restate /
 * archive), preserving the user's status/override/note. The function is idempotent
 * (upsert on the unique deal_id) and resumable (the cursor), so this wrapper simply
 * calls it in a loop until a batch comes back empty.
 *
 * MONOLITH-FIRST (Master PRD §6). No queue infrastructure: the deal actions and the
 * bulk recompute runner call this synchronously right after they write, so a deal
 * is never visible without its receivable. Because the cursor catches up whatever
 * is pending, a call also heals any events a prior run missed.
 */

// One batch covers the whole workbook (21 deals) and any realistic single-request
// fan-out; the loop keeps draining if a bulk recompute produced more.
const BATCH_SIZE = 500;

// A safety ceiling so a logic bug can never spin forever (500 × 500 = 250k events,
// far beyond any real workspace). Reaching it leaves the cursor resumable.
const MAX_BATCHES = 500;

type DealClient = Awaited<ReturnType<typeof createClient>>;

async function drain(supabase: DealClient): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const { data, error } = await supabase.rpc("consume_deal_events", {
      p_limit: BATCH_SIZE,
    });
    if (error) {
      throw new Error(`Could not sync receivables: ${error.message}`);
    }
    const processed = (data as unknown as { processed?: number })?.processed ?? 0;
    total += processed;
    if (processed === 0) break;
  }
  return total;
}

/**
 * Drain M4's cursor for the caller's workspace to completion. Returns the number of
 * events projected. Call after every deal mutation and after each bulk recompute.
 */
export async function consumeReceivableEvents(): Promise<number> {
  const supabase = await createClient();
  return drain(supabase);
}
