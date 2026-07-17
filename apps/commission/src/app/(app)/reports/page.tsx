import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <ModuleStub
      title="Reports"
      module="M8"
      description="Five collection reports: cash and tax by period, plus vintage analysis for your bookkeeper."
    />
  );
}
