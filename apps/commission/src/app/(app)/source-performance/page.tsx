import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Source Performance" };

export default function SourcePerformancePage() {
  return (
    <ModuleStub
      title="Source Performance"
      module="M7"
      description="NET GCI and collections broken down by lead source — which channels actually pay."
    />
  );
}
