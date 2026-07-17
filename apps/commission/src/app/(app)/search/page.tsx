import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <ModuleStub
      title="Search"
      module="M9"
      description="One search across deals, collectibles, and payments."
    />
  );
}
