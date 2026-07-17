import Link from "next/link";
import { LogOut, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";
import { MobileNav } from "./mobile-nav";

export type AppHeaderProps = {
  workspaceName: string;
  email: string;
  displayName: string | null;
};

export function AppHeader({
  workspaceName,
  email,
  displayName,
}: AppHeaderProps) {
  const initials = (displayName ?? email).slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-4">
      <MobileNav workspaceName={workspaceName} />

      <Link
        href={ROUTES.dashboard}
        className="flex min-w-0 items-center gap-2"
        data-testid="workspace-home-link"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          Z
        </span>
        <span className="truncate text-sm font-semibold">{workspaceName}</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Account menu"
                data-testid="account-menu-trigger"
              >
                <span className="text-xs font-semibold">{initials}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate font-normal">
              <span className="block text-sm font-medium">
                {displayName ?? "Agent"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href={ROUTES.settings}>
                  <SettingsIcon />
                  Settings
                </Link>
              }
            />
            <DropdownMenuSeparator />
            {/* A form, not an onClick: sign-out must be a POST so it cannot be
                triggered by a stray GET (prefetch, link preview, crawler). */}
            <form action={signOut}>
              <DropdownMenuItem
                render={
                  <button type="submit" className="w-full" data-testid="sign-out-button">
                    <LogOut />
                    Sign out
                  </button>
                }
              />
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
