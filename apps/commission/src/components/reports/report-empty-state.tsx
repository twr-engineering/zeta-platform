import Link from "next/link";
import { Receipt, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ROUTES } from "@/lib/routes";

/**
 * M8.3 — the reports empty state (rule 14 / FR-M8-15). Reports 1–4 are payment-
 * driven, so their empty state points at the Payments Log; report 5 is deal-driven,
 * so it points at the Deal Log. Every report renders its frame with this explanatory
 * state rather than a blank page on an empty workspace.
 */
export function ReportEmptyState({ source = "payments" }: { source?: "payments" | "deals" }) {
  if (source === "deals") {
    return (
      <EmptyState
        testId="empty-state-reports"
        icon={<FileText />}
        title="No deals logged yet"
        description="The Booking-Year Summary fills in as you log deals — each booking year's earned GCI, cash collected, and outstanding balance."
        action={
          <Button nativeButton={false} render={<Link href={ROUTES.deals} />}>
            Go to the Deal Log
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      testId="empty-state-reports"
      icon={<Receipt />}
      title="No payments logged yet"
      description="Reports aggregate payments — log your first release in the Payments Log and the periods fill in: cash and tax by period, plus vintage analysis for your bookkeeper."
      action={
        <Button nativeButton={false} render={<Link href={ROUTES.payments} />}>
          Go to the Payments Log
        </Button>
      }
    />
  );
}
