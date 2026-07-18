import { redirect } from "next/navigation";

import { reportPath, DEFAULT_REPORT_TAB } from "@/lib/reports/tabs";

/**
 * M8.3 — `/reports` lands on the first tab in sheet order (Cash per Year). The five
 * reports are each their own deep-linkable route; this keeps the bare `/reports`
 * path (the nav item) meaningful.
 */
export default function ReportsIndexPage() {
  redirect(reportPath(DEFAULT_REPORT_TAB));
}
