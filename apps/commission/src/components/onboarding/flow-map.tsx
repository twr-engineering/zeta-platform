/**
 * M10.2 — the product's flow map (FR-M10-02).
 *
 * The workbook's Start Here tab draws the spine as two chains: the collections
 * spine (Deal → Receivable → Payments → Dashboard) and the planning branch
 * (Deal → Yield → Calculator). Rendered here as labelled chips so the agent
 * sees where a logged deal goes before they log one. No color-only meaning —
 * each node is a labelled box (accessibility §8).
 */
import { ArrowRight } from "lucide-react";

function Node({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-3 py-2 text-center">
      <div className="text-sm font-medium leading-tight">{label}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{sub}</div>
    </div>
  );
}

function Arrow() {
  return (
    <ArrowRight
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  );
}

function Chain({
  title,
  nodes,
}: {
  title: string;
  nodes: readonly { label: string; sub: string }[];
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {nodes.map((node, i) => (
          <div key={node.label} className="flex items-center gap-2">
            <Node label={node.label} sub={node.sub} />
            {i < nodes.length - 1 && <Arrow />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlowMap() {
  return (
    <div className="space-y-4 rounded-lg border p-4" data-testid="onboarding-flow-map">
      <Chain
        title="Collections spine"
        nodes={[
          { label: "Deal", sub: "what you earned" },
          { label: "Receivable", sub: "what's owed" },
          { label: "Payments", sub: "what's collected" },
          { label: "Dashboard", sub: "your position" },
        ]}
      />
      <Chain
        title="Planning branch"
        nodes={[
          { label: "Deal", sub: "what you earned" },
          { label: "Yield Summary", sub: "your realized yield" },
          { label: "GCI Calculator", sub: "your targets" },
        ]}
      />
      <p className="text-xs text-pretty text-muted-foreground">
        You log deals and payments; everything else — receivables, the dashboard,
        yield and the calculator — builds itself from what you enter.
      </p>
    </div>
  );
}
