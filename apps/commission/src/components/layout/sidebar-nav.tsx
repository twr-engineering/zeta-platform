"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/routes";
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
