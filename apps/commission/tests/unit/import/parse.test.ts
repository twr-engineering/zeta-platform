import test from "node:test";
import assert from "node:assert/strict";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { buildSyntheticWorkbook } from "./synthetic";

test("parse: column mapping, code gap, rental 1/12 formula, overlay row-alignment", async () => {
  const bytes = await buildSyntheticWorkbook();
  const wb = await parseWorkbook(bytes);

  assert.equal(wb.deals.length, 3);
  const [d1, d2, d5] = wb.deals;

  // D001 — resale, untaxed, decimal rate read as "0.05", serial date → ISO.
  assert.equal(d1.deal_code, "D001");
  assert.equal(d1.transaction_type, "sale");
  assert.equal(d1.deal_type, "resale");
  assert.equal(d1.developer_name, null);
  assert.equal(d1.representation, "double_ended");
  assert.equal(d1.commission_basis, "percent");
  assert.equal(d1.rate_pct, "0.05");
  assert.equal(d1.list_price, "2000000");
  assert.equal(d1.booked_date, "2026-01-01");
  assert.equal(d1.mode_of_payment, "cash");
  assert.equal(d1.property_type_name, "House & Lot");
  assert.equal(d1.property_vat_rule, "threshold");

  // D002 — developer resolves comm base from Settings; taxable incentive.
  assert.equal(d2.deal_type, "developer");
  assert.equal(d2.developer_name, "Abrown Inc.");
  assert.equal(d2.developer_comm_base, "net");
  assert.equal(d2.incentive_billed, "40000");
  assert.equal(d2.incentive_taxable, "yes");

  // D005 — rental with the exact fraction preserved from the FORMULA cell.
  assert.equal(d5.deal_code, "D005");
  assert.equal(d5.transaction_type, "rental");
  assert.equal(d5.deal_type, "n_a");
  assert.equal(d5.rate_pct, "1/12");

  // Settings.
  assert.equal(wb.settings.property_types.length, 2);
  assert.equal(wb.settings.developers.length, 2);
  assert.equal(wb.settings.lead_sources.length, 3);
  assert.deepEqual(
    wb.settings.developers.find((d) => d.name === "Megaworld GERI"),
    { name: "Megaworld GERI", comm_base: "gross" }
  );
  assert.equal(wb.settings.tax.vat_rate, "0.12");
  assert.equal(wb.settings.tax.ewt_rate, "0.1");
  assert.equal(wb.settings.tax.property_vat_threshold, "3600000");

  // Payments — blank Type ≡ Commission handled; date serial → ISO.
  assert.equal(wb.payments.length, 1);
  assert.equal(wb.payments[0].deal_code, "D001");
  assert.equal(wb.payments[0].gross_amount, "100000");
  assert.equal(wb.payments[0].payment_type, "commission");

  // Overlays — row-aligned to the deals; D001's blank Deal-ID mirror recovered.
  assert.equal(wb.overlays.length, 3);
  assert.equal(wb.overlays[0].deal_code, "D001");
  assert.equal(wb.overlays[0].status, "closed");
  assert.equal(wb.overlays[1].deal_code, "D002");
  assert.equal(wb.overlays[1].status, "open");

  // Header validation passes for the expected v30.x layout.
  assert.ok(wb.headerChecks.every((h) => h.ok), "all headers should map");
});

test("build: code-gap preservation and engine wiring", async () => {
  const bytes = await buildSyntheticWorkbook();
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "syn.xlsx");

  // The sequence continues after the max imported code (Q26): D001..D005 → D006,
  // and the D003/D004 gap is never backfilled.
  assert.equal(plan.counts.deals, 3);
  assert.equal(plan.counts.next_deal_code, "D006");
  assert.equal(plan.counts.closed_statuses, 1);
  // Computed cells blank → nothing to reconcile against, so no mismatches.
  assert.equal(plan.mismatches.length, 0);

  // Engine is the single source of money truth — same figures the form produces.
  const d5 = plan.payload.deals.find((d) => d.deal_code === "D005")!;
  assert.equal(d5.derived.gci_net_of_vat, "22500.00"); // 270,000 × 1/12 exact
  assert.equal(d5.derived.net_gci, "22500.00");

  const d2 = plan.payload.deals.find((d) => d.deal_code === "D002")!;
  assert.equal(d2.derived.net_list_price, "7142857.14");
  assert.equal(d2.derived.gci_net_of_vat, "318877.55");
  assert.equal(d2.derived.incentive_net, "35714.29");
  assert.equal(d2.derived.net_gci, "354591.84");
});
