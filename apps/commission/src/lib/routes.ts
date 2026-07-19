/**
 * Single source of truth for paths. Middleware gating and the sidebar read from
 * here so a new screen cannot be added to the nav without a gating decision.
 */

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  resetPassword: "/reset-password",
  updatePassword: "/update-password",
  setupRequired: "/setup-required",
  dashboard: "/dashboard",
  deals: "/deals",
  dealNew: "/deals/new",
  dealImport: "/deals/import",
  payments: "/payments",
  paymentNew: "/payments/new",
  collectibles: "/collectibles",
  yieldSummary: "/yield-summary",
  calculator: "/calculator",
  sourcePerformance: "/source-performance",
  reports: "/reports",
  search: "/search",
  glossary: "/glossary",
  onboarding: "/onboarding",
  settings: "/settings",
  settingsGeneral: "/settings/general",
  settingsTax: "/settings/tax",
  settingsPropertyTypes: "/settings/property-types",
  settingsDevelopers: "/settings/developers",
  settingsLeadSources: "/settings/lead-sources",
  settingsAuditLog: "/settings/audit-log",
} as const;

/**
 * The export download URL (FR-M0-09). `/api/export/*` is authenticated by the
 * route handler itself — it is not in PUBLIC_PREFIXES below, so the middleware
 * gates it too, and an unauthenticated fetch never reaches the query.
 */
export function exportPath(dataset: string, format: "csv" | "xlsx"): string {
  return `/api/export/${dataset}?format=${format}`;
}

/**
 * The Search Console export URL (FR-M9-11). `params` is the serialized SearchQuery
 * (source + active filters + sort — the same params the screen carries), so the
 * download is exactly the filtered/sorted set on screen. The dedicated route
 * (`/api/export/search`) streams it; it is gated by its own handler, not public.
 */
export function searchExportPath(
  params: URLSearchParams,
  format: "csv" | "xlsx"
): string {
  const p = new URLSearchParams(params);
  p.set("format", format);
  return `/api/export/search?${p.toString()}`;
}

/** The fast-entry form, optionally preselecting a deal (deal detail cross-link). */
export function paymentNewPath(dealId?: string): string {
  return dealId ? `${ROUTES.paymentNew}?deal=${encodeURIComponent(dealId)}` : ROUTES.paymentNew;
}

/** A payment's edit / recompute screen, keyed on its id (M5.3, FR-M5-07/10). */
export function paymentEditPath(id: string): string {
  return `/payments/${encodeURIComponent(id)}/edit`;
}

/**
 * The collectibles ledger with an initial filter applied (M6 dashboard drill-downs,
 * FR-M6-12). The ledger seeds its client filter state from these params, so a
 * position tile lands on exactly the receivables it aggregated.
 */
export function collectiblesPath(filters?: {
  status?: "open" | "closed" | "cancelled";
  hasBalance?: boolean;
  overridden?: boolean;
  developer?: string;
  /** Aging drill-down (§4): an open, balance-owing row in this age bucket. */
  bucket?: "lt1" | "m1to3" | "m3to6" | "m6plus";
  /** Data Health (b): Open receivables paid in full or over (balance ≤ 0). */
  overpaid?: boolean;
  /** Data Health (c): Closed receivables short/over by more than ₱0.50. */
  varianceOverTolerance?: boolean;
}): string {
  if (!filters) return ROUTES.collectibles;
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.hasBalance) p.set("hasBalance", "true");
  if (filters.overridden) p.set("overridden", "true");
  if (filters.developer) p.set("developer", filters.developer);
  if (filters.bucket) p.set("bucket", filters.bucket);
  if (filters.overpaid) p.set("overpaid", "true");
  if (filters.varianceOverTolerance) p.set("variance", "over-tolerance");
  const s = p.toString();
  return s ? `${ROUTES.collectibles}?${s}` : ROUTES.collectibles;
}

/**
 * A Yield-Summary segment for a deal-list drill-through (M2 §6, FR-M2-12). `sales`
 * is the SALES SUBTOTAL population (Resale + Developer); the other four map 1:1 to
 * the classifier segments. The deal list resolves it through `classifySegment` so
 * the drilled-in count matches the segment row exactly (7 / 10 / 4 / 0).
 */
export type DealSegmentFilter = "resale" | "developer" | "sales" | "rental" | "referral";

/**
 * The deal log with an initial filter (M6 §7 Data Health drill-down, FR-M6-12; M2
 * segment drill-through, FR-M2-12; M7 source drill-through, FR-M7-09). `referralUnpaid`
 * seeds the list to deals with a referral fee owed out (check (d)); `segment` + `year`
 * land a Yield-Summary segment row on exactly the deals it aggregated; `source` +
 * `year` land a Source Performance row on the deals of that lead source (the M7 v1
 * cross-link, ahead of M9). `source` is a lead_source_id. A `year` of `"all"` is
 * omitted (the list's default), so the filters compose cleanly.
 */
export function dealsPath(filters?: {
  referralUnpaid?: boolean;
  segment?: DealSegmentFilter;
  source?: string;
  year?: number | "all";
}): string {
  if (!filters) return ROUTES.deals;
  const p = new URLSearchParams();
  if (filters.referralUnpaid) p.set("referral", "unpaid");
  if (filters.segment) p.set("segment", filters.segment);
  if (filters.source) p.set("source", filters.source);
  if (filters.year !== undefined && filters.year !== "all") p.set("year", String(filters.year));
  const s = p.toString();
  return s ? `${ROUTES.deals}?${s}` : ROUTES.deals;
}

/**
 * The payments list with an initial year/month filter (M6 §6, FR-M6-12) — the Net
 * Cash / Cash & Tax tiles and every Monthly Cash-In row drill down here.
 */
export function paymentsPath(filters?: {
  year?: number;
  month?: number;
  /** Data Health (M5 stale-basis): payments whose stored split anchors drifted. */
  stale?: boolean;
}): string {
  if (!filters) return ROUTES.payments;
  const p = new URLSearchParams();
  if (filters.year !== undefined) p.set("year", String(filters.year));
  if (filters.month !== undefined) p.set("month", String(filters.month));
  if (filters.stale) p.set("stale", "true");
  const s = p.toString();
  return s ? `${ROUTES.payments}?${s}` : ROUTES.payments;
}

/** A deal's detail / edit routes, keyed on its permanent code (D021). */
export function dealDetailPath(code: string): string {
  return `/deals/${encodeURIComponent(code)}`;
}
/** A receivable's detail route, keyed on its deal's permanent code (M4.4). */
export function collectibleDetailPath(code: string): string {
  return `/collectibles/${encodeURIComponent(code)}`;
}
export function dealEditPath(code: string): string {
  return `/deals/${encodeURIComponent(code)}/edit`;
}

/**
 * The whole-workspace archive (FR-M0-10) — every table as CSV+XLSX in one zip.
 * A static route beside `/api/export/[dataset]`, authenticated by its own
 * handler.
 */
export const WORKSPACE_EXPORT_PATH = "/api/export/workspace";

/**
 * Paths reachable without a session. `/auth/*` carries Supabase's email
 * confirmation and OAuth callbacks, which must run signed-out.
 */
const PUBLIC_PATHS: readonly string[] = [
  ROUTES.home,
  ROUTES.login,
  ROUTES.register,
  ROUTES.resetPassword,
  ROUTES.setupRequired,
];

const PUBLIC_PREFIXES: readonly string[] = ["/auth"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export type NavItem = {
  href: string;
  label: string;
  /** Module handle from the Master PRD, surfaced in the nav tooltip. */
  module: string;
};

/**
 * Top-level nav — mirrors the workbook's tabs (Master PRD §3, design/screens.md).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard", module: "M6" },
  { href: ROUTES.deals, label: "Deals", module: "M1" },
  { href: ROUTES.payments, label: "Payments", module: "M5" },
  { href: ROUTES.collectibles, label: "Collectibles", module: "M4" },
  { href: ROUTES.yieldSummary, label: "Yield Summary", module: "M2" },
  { href: ROUTES.calculator, label: "GCI Calculator", module: "M3" },
  { href: ROUTES.sourcePerformance, label: "Source Performance", module: "M7" },
  { href: ROUTES.reports, label: "Reports", module: "M8" },
  { href: ROUTES.search, label: "Search", module: "M9" },
  { href: ROUTES.glossary, label: "Glossary", module: "M10" },
  { href: ROUTES.settings, label: "Settings", module: "M0" },
];

/**
 * Settings left-nav (M0 §6). The order is the PRD's, not alphabetical: General
 * and Tax Settings are what a new agent touches first, and the Audit Log reads
 * as a footer to the rest.
 */
export const SETTINGS_NAV_ITEMS: readonly NavItem[] = [
  { href: ROUTES.settingsGeneral, label: "General", module: "M0.1" },
  { href: ROUTES.settingsTax, label: "Tax Settings", module: "M0.2" },
  { href: ROUTES.settingsPropertyTypes, label: "Property Types", module: "M0.3" },
  { href: ROUTES.settingsDevelopers, label: "Developers", module: "M0.3" },
  { href: ROUTES.settingsLeadSources, label: "Lead Sources", module: "M0.3" },
  { href: ROUTES.settingsAuditLog, label: "Audit Log", module: "M0.2" },
  // FR-M10-01 / rule 7: re-open the first-run wizard against current state. It
  // lives outside /settings (it is the whole-workspace wizard, not a settings
  // pane), but the PRD's re-entry point is Settings → "Setup assistant".
  { href: ROUTES.onboarding, label: "Setup assistant", module: "M10" },
];
