"use client";

/**
 * M10.1 — the contextual help popover + "?" trigger (FR-M10-11, PRD §6, OQ2).
 *
 * Native (no tour library, OQ2 default): the doctrine popovers must outlive any
 * tour, so the framework is ours. One control that is a popover on the desktop and a
 * bottom sheet at ≤ 640 px (rule 13). Keyboard-accessible and screen-reader labeled
 * (the trigger carries an aria-label; the surface is titled) — both come from Base
 * UI's Popover/Dialog primitives (focus trap + Escape for free). Content resolves
 * from the in-memory bundle, so opening is a render, not a fetch (< 100 ms).
 */
import * as React from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/lib/help/markdown";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHelpContent } from "./help-content-provider";
import type { GlossaryEntry, HelpArticle } from "@/lib/help/types";

/** Tracks the bottom-sheet breakpoint (rule 13: popovers become bottom sheets ≤ 640px). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

export type HelpTriggerProps = {
  label: string;
  className?: string;
  testId?: string;
  /** Base UI's Popover/Dialog Trigger injects props + ref here via `render`. */
  ref?: React.Ref<HTMLButtonElement>;
};

/** The "?" affordance — a small ghost icon button, screen-reader labeled. */
export function HelpTrigger({
  label,
  className,
  testId,
  ref,
  ...props
}: HelpTriggerProps) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      <HelpCircle aria-hidden="true" />
    </Button>
  );
}

/** The shared body: the article rendered with glossary auto-links + a glossary link. */
function HelpArticleBody({
  article,
  glossary,
  onNavigate,
}: {
  article: HelpArticle;
  glossary: GlossaryEntry[];
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Markdown body={article.bodyMd} glossary={glossary} />
      <div className="border-t pt-2.5">
        <Link
          href={ROUTES.glossary}
          onClick={onNavigate}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          data-testid="help-open-glossary"
        >
          Open glossary
        </Link>
      </div>
    </div>
  );
}

export type HelpPopoverProps = {
  /** Resolve the article by placement slug (preferred) … */
  placement?: string;
  /** … or by article key directly. One of placement/articleKey is required. */
  articleKey?: string;
  /** Accessible label for the "?" trigger (e.g. "About the input-vs-computed legend"). */
  label: string;
  /** Desktop popover side. */
  side?: "top" | "right" | "bottom" | "left";
  triggerClassName?: string;
  testId?: string;
};

export function HelpPopover({
  placement,
  articleKey,
  label,
  side = "bottom",
  triggerClassName,
  testId,
}: HelpPopoverProps) {
  const help = useHelpContent();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  const article = placement
    ? help.articleForPlacement(placement)
    : help.getArticle(articleKey ?? "");

  const trigger = (
    <HelpTrigger label={label} className={triggerClassName} testId={testId} />
  );
  const close = () => setOpen(false);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={trigger} />
        <SheetContent
          side="bottom"
          className="max-h-[80vh] gap-3 overflow-y-auto rounded-t-2xl pb-6"
          data-testid="help-sheet"
        >
          <SheetHeader className="px-4 pb-0">
            <SheetTitle>{article.title}</SheetTitle>
          </SheetHeader>
          <div className="px-4">
            <HelpArticleBody article={article} glossary={help.glossary} onNavigate={close} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger render={trigger} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side={side} sideOffset={6} className="z-50">
          <PopoverPrimitive.Popup
            className={cn(
              "w-80 max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg",
              "transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
              "focus-visible:outline-none"
            )}
            data-testid="help-popover"
          >
            <PopoverPrimitive.Title className="mb-2 font-heading text-sm font-semibold text-foreground">
              {article.title}
            </PopoverPrimitive.Title>
            <HelpArticleBody article={article} glossary={help.glossary} onNavigate={close} />
            <PopoverPrimitive.Arrow className="size-2.5 rotate-45 rounded-[2px] border-b border-r bg-popover data-[side=top]:-bottom-1" />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
