"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { stepRecompute } from "@/lib/settings/recompute-runner";
import type { RecomputeProgress } from "@/lib/settings/recompute";

/**
 * The recompute progress + resume surface (FR-M1-07).
 *
 * A restating settings change drains its recompute synchronously in the action,
 * so this banner is usually absent — it appears only when a drain was
 * interrupted or failed and work is still pending. Then it shows what is left
 * and drives the remaining batches to completion (stepRecompute in a loop),
 * moving the bar as it goes, and refreshes the page when the queue is empty.
 *
 * Progress is the recompute_job row's own counters (total / processed), so the
 * bar reflects committed work, not an optimistic guess — a reload mid-drain
 * shows exactly how far the durable job actually got.
 */
export function RecomputeBanner({ jobs }: { jobs: RecomputeProgress[] }) {
  const router = useRouter();
  const [items, setItems] = useState(jobs);
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  const pending = items.filter((job) => !job.done && job.status !== "completed");

  async function drive() {
    if (running) return;
    setRunning(true);
    try {
      for (const job of items) {
        if (job.done || job.status === "completed" || !job.jobId) continue;
        // Step until this job reports done; each step is one committed batch.
        let guard = 0;
        let current = job;
        while (!current.done && guard < 1000) {
          current = await stepRecompute(job.jobId);
          setItems((prev) => prev.map((j) => (j.jobId === job.jobId ? current : j)));
          guard += 1;
        }
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  // Resume interrupted work automatically — this banner only renders when there
  // is pending work, and finishing it is always the right thing.
  useEffect(() => {
    if (startedRef.current) return;
    if (pending.length === 0) return;
    startedRef.current = true;
    void drive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending.length === 0) return null;

  const total = pending.reduce((sum, job) => sum + job.total, 0);
  const processed = pending.reduce((sum, job) => sum + Math.min(job.processed, job.total), 0);
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const failed = pending.some((job) => job.status === "failed");

  return (
    <Alert data-testid="recompute-banner">
      {failed ? <TriangleAlert /> : <RefreshCw className={running ? "animate-spin" : undefined} />}
      <AlertTitle>
        {failed ? "A recompute needs finishing" : "Restating your deals"}
      </AlertTitle>
      <AlertDescription>
        <div className="w-full space-y-2">
          <p data-testid="recompute-progress-text">
            {processed} of {total} {total === 1 ? "deal" : "deals"} recomputed
            {failed && " — resume to finish"}.
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${pct}%` }}
              data-testid="recompute-progress-bar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
          {failed && !running && (
            <Button size="sm" onClick={() => void drive()} data-testid="recompute-resume">
              Resume
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
