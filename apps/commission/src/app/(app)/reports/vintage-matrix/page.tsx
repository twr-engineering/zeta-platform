import { getVintageMatrix } from "@/lib/reports/queries";
import { parseMatrixValueParam } from "@/lib/reports/params";
import { VINTAGE_MATRIX_CAPTION } from "@/lib/reports";
import { ReportTabHeader } from "@/components/reports/report-tab-header";
import { ReportEmptyState } from "@/components/reports/report-empty-state";
import { MatrixValueToggle } from "@/components/reports/matrix-value-toggle";
import { VintageMatrixTable } from "@/components/reports/vintage-matrix-table";

/**
 * M8.3 — Report 2 tab (the vintage matrix, all-time). The value toggle is URL state
 * (`?value=`, default Net of VAT); an unknown value falls back to the default rather
 * than erroring the page. The verbatim reading guide sits directly under the title
 * (§3.3). Empty when no payments exist — the matrix is payment-driven (rule 14).
 */
export default async function VintageMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ value?: string | string[] }>;
}) {
  const raw = (await searchParams).value;
  const rawValue = Array.isArray(raw) ? raw[0] : raw;
  const parsed = parseMatrixValueParam(rawValue ?? null);
  const value = parsed.ok ? parsed.value : "net_of_vat";

  const matrix = await getVintageMatrix(value);
  const empty = matrix.rows.length === 0;

  return (
    <div className="space-y-4">
      <ReportTabHeader
        slug="vintage-matrix"
        caption={VINTAGE_MATRIX_CAPTION}
        control={<MatrixValueToggle value={value} />}
      />
      {empty ? <ReportEmptyState /> : <VintageMatrixTable matrix={matrix} />}
    </div>
  );
}
