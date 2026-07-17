"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";

export type MobileNavProps = {
  workspaceName: string;
};

/** Drawer nav for < lg. The sidebar is always-on from lg up. */
export function MobileNav({ workspaceName }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            data-testid="mobile-nav-trigger"
          >
            <Menu />
          </Button>
        }
      />
      <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="truncate text-sm">{workspaceName}</SheetTitle>
        </SheetHeader>
        <SidebarNav className="p-2" onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
