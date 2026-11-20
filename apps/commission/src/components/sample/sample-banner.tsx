"use client";

/**
 * M10.3 — the persistent sample-data banner (rule 4). While the workspace has a
 * sample deal on its books it shows across the M1/M4/M5/M6 surfaces (rendered from
 * the app shell), stating that sample data is included in the figures and offering
 * the one-click cleanup cascade. Removing it deletes the payment, receivable and
 * deal together (cleanup_sample_data) and returns every dashboard to zero.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cleanupSampleData } from "@/lib/onboarding/sample";

export function SampleBanner({ sampleDealCode }: { sampleDealCode: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      await cleanupSampleData();
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div
      className="no-print border-b border-amber-500/30 bg-amber-500/10"
      data-testid="sample-banner"
      role="status"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <FlaskConical className="size-4 shrink-0 text-amber-600" aria-hidden />
        <span className="text-amber-800 dark:text-amber-300">
          Sample data is on your books
          {sampleDealCode ? ` (${sampleDealCode})` : ""} — it&rsquo;s included in your
          figures so you can explore.
        </span>

        {!confirming ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-amber-500/40 text-amber-800 dark:text-amber-300"
            onClick={() => setConfirming(true)}
            data-testid="sample-banner-remove"
          >
            Remove sample data
          </Button>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-amber-800 dark:text-amber-300">
              Delete the sample deal, its receivable and any payments?
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={pending}
              data-testid="sample-banner-cancel"
            >
              Keep it
            </Button>
            <Button
              size="sm"
              onClick={remove}
              disabled={pending}
              data-testid="sample-banner-confirm"
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
            {!pending && (
              <button
                type="button"
                onClick={() => setConfirming(false)}
                aria-label="Cancel"
                className="text-amber-700 hover:text-amber-900"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
