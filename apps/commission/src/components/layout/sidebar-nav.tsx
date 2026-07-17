"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NAV_ITEMS, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type SidebarNavProps = {
  /** Closes the mobile drawer once a destination is picked. */
  onNavigate?: () => void;
  className?: string;
};

export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-0.5", className)}>
      {/* The daily heartbeat gets the one prominent action in the nav (§6.1):
          logging a release is what the agent opens the app to do. */}
      <Button
        nativeButton={false}
        render={<Link href={ROUTES.paymentNew} onClick={onNavigate} />}
        className="mb-2 min-h-11 w-full justify-start"
        data-testid="nav-log-release"
      >
        <Banknote className="size-4" /> Log a release
      </Button>

      {NAV_ITEMS.map((item) => {
        // Nested routes (/deals/D001) keep the section highlighted.
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            data-testid={`nav-${item.href.slice(1)}`}
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              // 44px min touch target — the nav is used one-handed on a phone.
              "min-h-11 flex items-center",
              isActive
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
