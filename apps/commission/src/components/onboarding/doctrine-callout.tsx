"use client";

/**
 * M10.2 — a first-class doctrine callout for the wizard.
 *
 * Renders a §6.3 article VERBATIM (rule 12 — the stored bytes are the Start Here
 * text; a CI test byte-matches them against the PRD). Used for the P0 philosophy
 * interstitial (rule 16) and the P11 EWT-5% explainer (rule 15 — "a first-class
 * callout, never fine print"). The same article is also reachable from its "?"
 * popover elsewhere; here it is shown open, in the flow, because the agent has
 * not learned it yet.
 */
import { Markdown } from "@/lib/help/markdown";
import { useHelpContent } from "@/components/help/help-content-provider";
import { HelpPopover } from "@/components/help/help-popover";
import { cn } from "@/lib/utils";

export function DoctrineCallout({
  articleKey,
  placement,
  popoverLabel,
  tone = "muted",
  className,
  testId,
}: {
  articleKey: string;
  /** Optional placement slug for the paired "?" popover (deep-links the same article). */
  placement?: string;
  popoverLabel?: string;
  tone?: "muted" | "primary";
  className?: string;
  testId?: string;
}) {
  const help = useHelpContent();
  const article = help.getArticle(articleKey);

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "bg-muted/40",
        className,
      )}
      data-testid={testId}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          {article.title}
        </h3>
        {placement && (
          <HelpPopover
            placement={placement}
            label={popoverLabel ?? `About: ${article.title}`}
            testId={`${testId ?? articleKey}-help`}
          />
        )}
      </div>
      <div className="text-sm text-pretty text-muted-foreground">
        <Markdown body={article.bodyMd} glossary={help.glossary} />
      </div>
    </div>
  );
}
