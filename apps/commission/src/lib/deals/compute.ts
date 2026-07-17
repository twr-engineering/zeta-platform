import { computeDeal, type DealDerived, type EngineSettings } from "@/lib/engine";
import type { TaxSettings } from "@/types/entities";
import { buildComputeInput, type DealComputeRefs } from "./map";
import type { DealInput } from "./schema";

/**
 * The app-layer bridge to the M1.1 engine (FR-M1-05). The engine is a pure
 * library; this is the one place M1.2 calls it before persisting. The DB write
 * path then re-checks the pure composition invariants (Rule G/H) so a forged
 * call can't land figures the engine never produced — but the tax math is
 * computed here, once, from the single source of truth.
 */

/** tax_settings row → the engine's settings snapshot (all rates already strings). */
export function toEngineSettings(tax: TaxSettings): EngineSettings {
  return {
    vat_rate: tax.vat_rate,
    ewt_rate: tax.ewt_rate,
    property_vat_threshold: tax.property_vat_threshold,
    vat_registered: tax.vat_registered,
  };
}

/** Run the engine for a validated deal + its resolved references + settings. */
export function deriveDeal(
  input: DealInput,
  refs: DealComputeRefs,
  tax: TaxSettings
): DealDerived {
  return computeDeal(buildComputeInput(input, refs), toEngineSettings(tax));
}
