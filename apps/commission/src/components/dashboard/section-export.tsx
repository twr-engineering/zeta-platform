import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportPath } from "@/lib/routes";

/**
 * The CSV/XLSX download pair a dashboard tabular section carries in its header
 * (FR-M6-14). `dataset` is the export registry name (e.g. "dashboard-aging"); the
 * whole-section datasets are all-time, so no on-screen filter query rides along.
 */
export function SectionExport({ dataset, label }: { dataset: string; label: string }) {
  return (
    <div className="flex gap-2">
      {(["csv", "xlsx"] as const).map((format) => (
        <Button
          key={format}
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={exportPath(dataset, format)} />}
          data-testid={`export-${dataset}-${format}`}
          aria-label={`Export ${label} as ${format.toUpperCase()}`}
        >
          <Download className="size-4" /> {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
