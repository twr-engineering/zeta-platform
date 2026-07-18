import { DashboardSection } from "./section";

/**
 * A placeholder for a section that lands in a later M6 pass (Aging & Receivables by
 * Developer + Data Health in M6.3; the Chase List in M6.4). It holds the section's
 * place in the sheet's fixed 1→8 order so the page reads as the full dashboard
 * skeleton and later passes slot straight in (M6.2 brief).
 */
export function SectionPlaceholder({
  index,
  title,
  note,
}: {
  index: number;
  title: string;
  note: string;
}) {
  return (
    <DashboardSection index={index} title={title} testId={`section-placeholder-${index}`}>
      <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        {note}
      </div>
    </DashboardSection>
  );
}
