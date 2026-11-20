/**
 * M10.4 — the empty-state registry (FR-M10-14, PRD §6.4).
 *
 * Every M1–M9 list/dashboard surface must render an empty state that teaches what
 * fills it and links to the filling action — never a blank grid (CLAUDE.md: no mock
 * data, plus a real empty state). This registry is the single catalogue of those
 * surfaces: the canonical copy essence per §6.4, the source file that owns the
 * surface, and the stable `testId` the surface renders on its empty state.
 *
 * The M10.4 coverage test (`tests/unit/help/empty-state-registry.test.ts`) reads
 * this registry and fails the build if any listed surface's source file has lost
 * its empty-state marker (AC10). M10 owns no money — nothing here is financial.
 */

export type EmptyStateEntry = {
  /** Owning module. */
  module: string;
  /** Human description of the surface. */
  surface: string;
  /** Repo-relative source file that renders the surface's empty state. */
  sourceFile: string;
  /** The stable `data-testid` on the rendered empty state (coverage marker). */
  testId: string;
  /** Canonical §6.4 copy essence (audit reference; the surface conveys this). */
  copy: string;
  /** The filling action(s) the empty state links to (§6.4). */
  actions: string;
};

export const EMPTY_STATE_REGISTRY = {
  deals: {
    module: "M1",
    surface: "Deals list",
    sourceFile: "src/app/(app)/deals/page.tsx",
    testId: "empty-state-deals",
    copy: "No deals yet — log your first closed deal, or import your v30.x workbook.",
    actions: "New deal · Import",
  },
  receivables: {
    module: "M4",
    surface: "Receivables ledger",
    sourceFile: "src/app/(app)/collectibles/page.tsx",
    testId: "empty-state-receivables",
    copy: "Receivables create themselves — one per deal, automatically. Log a deal and it appears here.",
    actions: "New deal",
  },
  payments: {
    module: "M5",
    surface: "Payments list",
    sourceFile: "src/app/(app)/payments/page.tsx",
    testId: "empty-state-payments",
    copy: "No deals: Payments attach to deals — log a deal first. Deals exist: Log your first commission release; VAT and EWT split automatically.",
    actions: "New deal / New payment",
  },
  dashboard: {
    module: "M6",
    surface: "Dashboard",
    sourceFile: "src/app/(app)/dashboard/page.tsx",
    testId: "dashboard-empty",
    copy: "Your position appears after your first deal; pace after your first payment.",
    actions: "New deal · Checklist card",
  },
  yield: {
    module: "M2",
    surface: "Yield summary",
    sourceFile: "src/app/(app)/yield-summary/page.tsx",
    testId: "empty-state-yield",
    copy: "Segments, blended yield and average price appear after your first Sale deal.",
    actions: "New deal",
  },
  calculator: {
    module: "M3",
    surface: "Calculator / planning targets",
    sourceFile: "src/components/planning/planning-screen.tsx",
    testId: "empty-state-calculator",
    copy: "Planning basis = your all-time realized yield and average price. Until you have deals, enter a manual Yield and Avg Price in the targets table — the calculator runs either way.",
    actions: "Open targets table · New deal",
  },
  sources: {
    module: "M7",
    surface: "Source performance scorecard",
    sourceFile: "src/app/(app)/source-performance/page.tsx",
    testId: "empty-state-sources",
    copy: "Deals carry a lead source; the scorecard builds from them. Add sources in Settings, then log deals.",
    actions: "Settings → Lead Sources · New deal",
  },
  reports: {
    module: "M8",
    surface: "Reports",
    sourceFile: "src/components/reports/report-empty-state.tsx",
    testId: "empty-state-reports",
    copy: "Reports aggregate payments. Log your first release and the periods fill in.",
    actions: "New payment",
  },
  search: {
    module: "M9",
    surface: "Search console",
    sourceFile: "src/components/search/search-console.tsx",
    testId: "search-empty",
    copy: 'Fresh: Nothing to search yet. Filtered-empty (verbatim from the sheet): "No matching records — adjust your filters above."',
    actions: "Clear filters",
  },
} as const satisfies Record<string, EmptyStateEntry>;

export type EmptyStateKey = keyof typeof EMPTY_STATE_REGISTRY;
