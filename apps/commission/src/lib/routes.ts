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
  payments: "/payments",
  collectibles: "/collectibles",
  yieldSummary: "/yield-summary",
  calculator: "/calculator",
  sourcePerformance: "/source-performance",
  reports: "/reports",
  search: "/search",
  settings: "/settings",
} as const;

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
  { href: ROUTES.settings, label: "Settings", module: "M0" },
];
