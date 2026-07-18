/**
 * M7 Source Performance — the pure aggregation surface (M7.1). The server reads
 * live in ./queries (server-only) and are imported directly from there by M7.2's
 * page; this barrel re-exports ONLY the pure build layer + types, so a client
 * component or a test can hold rows and compute without pulling `server-only`.
 */
export {
  sourcePerformance,
  collectedNetForSource,
  distinctBookedYears,
  type SourceMetrics,
  type SourcePerformanceRow,
  type SourcePerformanceTotal,
  type SourcePerformanceReport,
  type SourceLeadSource,
} from "./build";
export {
  sourcePerformanceToRows,
  SOURCE_PERFORMANCE_COLUMNS,
  type SourceExportRow,
} from "./export-rows";
