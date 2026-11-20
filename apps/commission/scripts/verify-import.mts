/**
 * Offline verification of the M1.4 parse → engine → reconcile pipeline against the
 * REAL v30.20 workbook (referenced from discovery/source, never committed to tests).
 * Writes nothing; proves the anchors reproduce before the live DB run.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/verify-import.mts
 */
import { readFileSync } from "node:fs";
import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";

const FILE =
  "discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx";

const bytes = new Uint8Array(readFileSync(FILE));
const wb = await parseWorkbook(bytes);
const plan = buildImportPlan(wb, sha256Hex(bytes), "v30.20.xlsx");

console.log("counts:", plan.counts);
console.log("anchors:", plan.anchors);
console.log("mismatches:", plan.mismatches.length);
for (const m of plan.mismatches) console.log("  MISMATCH", m);
console.log("notices:", plan.notices);
const badHeaders = plan.headerChecks.filter((h) => !h.ok);
console.log("header drift:", badHeaders.length, badHeaders);

const EXPECT = {
  total_collectible: "6763497.25",
  payment_net_collected: "1908192.86",
  outstanding_pending: "4855304.39",
};
const ok =
  plan.anchors.total_collectible === EXPECT.total_collectible &&
  plan.anchors.payment_net_collected === EXPECT.payment_net_collected &&
  plan.anchors.outstanding_pending === EXPECT.outstanding_pending &&
  plan.mismatches.length === 0 &&
  plan.counts.deals === 21 &&
  plan.counts.payments === 8 &&
  plan.counts.closed_statuses === 7 &&
  plan.counts.next_deal_code === "D022";
console.log(ok ? "\n✅ ANCHORS + COUNTS EXACT" : "\n❌ MISMATCH vs expected");
process.exit(ok ? 0 : 1);
