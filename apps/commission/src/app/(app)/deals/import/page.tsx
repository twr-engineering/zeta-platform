import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Import deals" };

/**
 * The workbook importer (FR-M1-10) is M1.4. This is its entry point — reachable
 * from the deals empty state — held as a clearly-labelled placeholder so the
 * link exists and the flow is discoverable before the importer itself lands.
 */
export default function ImportDealsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <EmptyState
        icon={<Upload />}
        title="Workbook importer is coming soon"
        description="The one-time importer migrates an existing v30.x ZETA workbook — every deal with its original codes, payments and collectible statuses. It arrives in the next milestone (M1.4). For now, log deals directly."
        action={
          <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />}>
            Log a deal instead
          </Button>
        }
      />
    </div>
  );
}
