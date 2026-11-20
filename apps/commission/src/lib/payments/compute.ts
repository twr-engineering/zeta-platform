import { computePaymentSplit } from "@/lib/engine";
import { toEngineSettings } from "@/lib/deals/compute";
import type { Deal, TaxSettings } from "@/types/entities";
import { buildPaymentSplitInput, usedRates, type PaymentSnapshot } from "./map";
import type { PaymentInput } from "./schema";

/**
 * The app-layer bridge to M1.1's payment split (FR-M5-05, §3.2). The engine is a
 * pure library and the SINGLE source of money truth; this is the one place M5
 * calls it. **M5 must NOT re-implement this math** — not here, not in a preview,
 * not in the UI (M5.2). The DB write path then re-checks only the pure ties
 * (K+L=H, N=H−M, retained) so a forged call can't land an inconsistent split.
 *
 * SNAPSHOT SEMANTICS (§3.3). The split is computed from the deal's *current*
 * vat_basis + incentive_taxable and the workspace's *current* vat_rate/ewt_rate,
 * and the result — the five ₱ fields plus the three `*_used` anchors — is stored
 * on the row. On create this is the save-time snapshot; on edit the caller runs
 * this again with the deal/settings as they are NOW (a re-snapshot). A deal edit
 * or a rate change never calls this against a stored payment — that is the whole
 * point of the snapshot (a historical fact, not a live formula).
 */
export function derivePaymentSnapshot(
  input: PaymentInput,
  deal: Deal,
  tax: TaxSettings
): PaymentSnapshot {
  const split = computePaymentSplit(
    buildPaymentSplitInput(input, deal),
    toEngineSettings(tax)
  );
  return {
    split,
    // vat_basis_used snapshots the deal's basis as the DB token (the column is
    // deal_vat_basis) — the split's audit anchor (§3.1 field 11).
    vat_basis_used: deal.vat_basis,
    ...usedRates(tax),
  };
}
