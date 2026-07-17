import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Collectibles" };

export default function CollectiblesPage() {
  return (
    <ModuleStub
      title="Collectibles"
      module="M4"
      description="One receivable per deal: total collectible versus collected, the balance left, status, variance, and write-offs."
    />
  );
}
