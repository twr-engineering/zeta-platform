"use client";

/**
 * M10.3 — the typed-along walkthrough's coach-marks (FR-M10-07, rule 13).
 *
 * A lightweight, dependency-free overlay (OQ2: native, no tour library). It walks a
 * sequence of CoachMarks, each pointing at a form field or a computed-panel figure
 * by its data-testid: it scrolls the anchor into view, draws a highlight ring around
 * it, and shows an explanatory card. On a wide viewport the card floats next to the
 * anchor; at ≤640px it becomes a bottom sheet (rule 13). Keyboard + screen-reader
 * friendly (a labelled dialog with focusable controls).
 *
 * It computes NO money — the figures it explains are already on screen, rendered by
 * M1's engine; the copy that quotes them is authored in sample-fixture.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoachMark } from "@/lib/onboarding/sample-fixture";

type Rect = { top: number; left: number; width: number; height: number };

export function CoachMarks({
  marks,
  onFinish,
  onSkip,
}: {
  marks: readonly CoachMark[];
  onFinish: () => void;
  onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const mark = marks[index];
  const isLast = index === marks.length - 1;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Track the current anchor's position: scroll it into view, then measure it (and
  // re-measure on scroll/resize so the ring + card follow it).
  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${mark.anchor}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [mark.anchor]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${mark.anchor}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Measure after the smooth scroll has a chance to settle, then keep it live.
    const t = setTimeout(measure, 320);
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    cardRef.current?.focus();
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [mark.anchor, measure]);

  const next = () => (isLast ? onFinish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Desktop card position: below the anchor when there's room, else above — but
  // ALWAYS clamped fully inside the viewport. Without the clamp, an anchor scrolled
  // above the fold (rect.top negative) drove the fixed card off the top of the
  // screen (top < 0), leaving Back/Next/Skip unreachable (M10.5 reachability fix).
  const cardStyle: React.CSSProperties = (() => {
    if (isMobile || !rect) return {};
    // Generous upper bound on the card's own height; the real card is shorter, so
    // this keeps the whole card on-screen with margin to spare.
    const CARD_H = 240;
    const below = rect.top + rect.height + 12;
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const placeBelow = spaceBelow > 220;
    const desired = placeBelow ? below : rect.top - 12 - CARD_H;
    const maxTop = Math.max(12, window.innerHeight - CARD_H - 12);
    const top = Math.min(Math.max(12, desired), maxTop);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 360 - 12);
    return { position: "fixed", top, left, width: 360, zIndex: 60 };
  })();

  return (
    <div data-testid="coach-marks" data-coach-step={mark.id}>
      {/* Dimmed backdrop — pointer-events-none so the REAL form underneath stays
          fully interactive (the walkthrough is typed-along, FR-M10-07). It only
          focuses attention; the card drives navigation. */}
      <div className="pointer-events-none fixed inset-0 z-40 bg-black/30" aria-hidden />

      {/* The highlight ring around the current anchor. */}
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}

      {/* The coach card — a bottom sheet on mobile, a floating card on desktop. */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="coach-title"
        aria-describedby="coach-body"
        tabIndex={-1}
        // Escape dismisses the tour — the standard keyboard affordance for a
        // dialog. Scoped to the card (it auto-focuses each step), so it never
        // steals Escape from a native select open in the form beneath.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onSkip();
          }
        }}
        data-testid="coach-mark"
        className={cn(
          "z-[60] rounded-xl border bg-card p-4 shadow-lg outline-none",
          isMobile
            ? "fixed inset-x-2 bottom-2 z-[60]"
            : "max-w-[360px]",
        )}
        style={isMobile ? { zIndex: 60 } : cardStyle}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">
            Step {index + 1} of {marks.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            data-testid="coach-skip"
          >
            Skip the tour
          </button>
        </div>
        <h3 id="coach-title" className="font-heading text-base font-medium">
          {mark.title}
        </h3>
        <p id="coach-body" className="mt-1 text-sm text-pretty text-muted-foreground">
          {mark.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            disabled={index === 0}
            data-testid="coach-back"
          >
            Back
          </Button>
          <Button type="button" size="sm" onClick={next} data-testid={isLast ? "coach-finish" : "coach-next"}>
            {isLast ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
