"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SETTINGS_NAV_ITEMS } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The Settings left-nav (M0 §6).
 *
 * Two presentations, one list. At lg+ it is the left-hand column the PRD asks
 * for; below that it becomes a horizontally scrollable strip above the content —
 * a 240px sidebar inside a 360px viewport would leave the actual settings
 * unusable, and M0 §6 is explicit that mobile is not a nice-to-have here.
 */
export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings"
      className={cn(
        // Mobile: one scrolling row. `-mx-4 px-4` lets it bleed to the screen
        // edge so the last item doesn't look clipped mid-word.
        "-mx-4 flex gap-1 overflow-x-auto px-4 pb-2",
        // Desktop: the left column.
        "lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0",
        className
      )}
    >
      {SETTINGS_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            data-testid={`settings-nav-${item.href.split("/").pop()}`}
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
              isActive
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
