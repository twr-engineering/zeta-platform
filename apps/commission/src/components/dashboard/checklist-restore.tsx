"use client";

/**
 * M10.3 — restore the getting-started checklist from Settings (§3.2: dismissal is
 * reversible). Shown only when the card is currently dismissed.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { restoreChecklist } from "@/lib/onboarding/checklist-actions";

export function ChecklistRestore() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const restore = () => {
    startTransition(async () => {
      await restoreChecklist();
      setDone(true);
      router.refresh();
    });
  };

  return (
    <Button
      variant="outline"
      onClick={restore}
      disabled={pending || done}
      data-testid="checklist-restore"
    >
      {done ? "Restored — it's back on your dashboard" : "Show the checklist again"}
    </Button>
  );
}
