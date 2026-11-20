import ExcelJS from "exceljs";

import {
  COLLECTIBLE_COLUMNS,
  DEAL_COLUMNS,
  PAYMENT_COLUMNS,
} from "@/lib/import/mapping";

/**
 * A tiny synthetic v30.x-shaped workbook for the parser/importer tests — NEVER the
 * real workbook (that lives in discovery/source and is referenced only by the live
 * anchor run). It exercises the load-bearing quirks:
 *   - a CODE GAP (D001, D002, D005 — D003/D004 skipped): next new deal is D006;
 *   - a rental whose Rate % is the exact FORMULA `=1/12` with no cached result;
 *   - a Collectibles row whose Deal ID mirror is BLANK (recovered by row alignment).
 * Every computed Deal-Log cell is left blank (a "cache-lost" row), so reconciliation
 * is skipped and the plan is clean — the reconcile comparator is tested separately.
 */
export async function buildSyntheticWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();

  // --- Settings ---
  const s = wb.addWorksheet("Settings");
  s.getCell("B6").value = "VAT rate";
  s.getCell("C6").value = 0.12;
  s.getCell("B7").value = "EWT rate (creditable)";
  s.getCell("C7").value = 0.1;
  s.getCell("B8").value = "VAT threshold";
  s.getCell("C8").value = 3600000;
  s.getCell("B9").value = "Chase idle threshold (months)";
  s.getCell("C9").value = 3;
  s.getCell("B14").value = "Property Type";
  s.getCell("C14").value = "VAT Rule";
  s.getCell("B15").value = "House & Lot";
  s.getCell("C15").value = "Threshold";
  s.getCell("B16").value = "Lot";
  s.getCell("C16").value = "Always VAT";
  s.getCell("B50").value = "Developer";
  s.getCell("C50").value = "Comm Base";
  s.getCell("B51").value = "Abrown Inc.";
  s.getCell("C51").value = "Net";
  s.getCell("B52").value = "Megaworld GERI";
  s.getCell("C52").value = "Gross";
  s.getCell("B154").value = "Source";
  s.getCell("B155").value = "Referral";
  s.getCell("B156").value = "YouTube";
  s.getCell("B157").value = "Repeat Client";

  // --- header helper ---
  const setHeaders = (
    ws: ExcelJS.Worksheet,
    cols: Record<string, { col: string; expected: string }>
  ) => {
    for (const { col, expected } of Object.values(cols)) {
      ws.getCell(`${col}5`).value = expected;
    }
  };

  // --- Deal Log ---
  const dl = wb.addWorksheet("Deal Log");
  setHeaders(dl, DEAL_COLUMNS);
  const setDeal = (
    row: number,
    v: Record<string, string | number | Date | { formula: string } | null>
  ) => {
    for (const [key, col] of Object.entries(DEAL_COLUMNS)) {
      if (key in v && v[key] !== null) dl.getCell(`${col.col}${row}`).value = v[key] as never;
    }
  };
  // D001 — resale, untaxed, % 5% on ₱2,000,000.
  setDeal(6, {
    deal_code: "D001",
    booked_date: new Date(Date.UTC(2026, 0, 1)),
    transaction_type: "Sale",
    deal_type: "Resale",
    client_name: "Client One",
    representation: "Double Ended",
    property_type: "House & Lot",
    lead_source: "Referral",
    property_details: "Blk 1 Lot 1",
    mode_of_payment: "Cash",
    list_price: 2000000,
    commission_basis: "%",
    rate_pct: 0.05,
    receipt_issued: "No",
  });
  // D002 — developer Abrown (Net), % 5% on ₱8,000,000, taxable incentive.
  setDeal(7, {
    deal_code: "D002",
    booked_date: new Date(Date.UTC(2026, 5, 15)),
    transaction_type: "Sale",
    deal_type: "Developer",
    developer: "Abrown Inc.",
    client_name: "Client Two",
    representation: "Double Ended",
    property_type: "House & Lot",
    lead_source: "YouTube",
    property_details: "Blk 2 Lot 2",
    mode_of_payment: "Bank",
    list_price: 8000000,
    commission_basis: "%",
    rate_pct: 0.05,
    receipt_issued: "Yes",
    incentive_billed: 40000,
    incentive_taxable: "Yes",
  });
  // D005 — rental, exact 1/12 FORMULA rate, annual rent ₱270,000. (D003/D004 skipped.)
  setDeal(8, {
    deal_code: "D005",
    booked_date: new Date(Date.UTC(2026, 3, 13)),
    transaction_type: "Rental",
    deal_type: "N/A",
    client_name: "Client Five",
    representation: "Lessor",
    property_type: "House & Lot",
    lead_source: "Repeat Client",
    property_details: "Ignatius Enclave",
    mode_of_payment: "Cash",
    list_price: 270000,
    commission_basis: "%",
    receipt_issued: "No",
  });
  dl.getCell("R8").value = { formula: "1/12" }; // no cached result, like the export

  // --- Payments Log ---
  const pl = wb.addWorksheet("Payments Log");
  setHeaders(pl, PAYMENT_COLUMNS);
  pl.getCell("B6").value = new Date(Date.UTC(2026, 0, 13));
  pl.getCell("C6").value = "D001";
  pl.getCell("H6").value = 100000; // 5% × 2,000,000, untaxed
  pl.getCell("I6").value = "Commission";

  // --- Collectibles (row-aligned to the deals; D001's Deal ID mirror is blank) ---
  const cl = wb.addWorksheet("Collectibles");
  setHeaders(cl, COLLECTIBLE_COLUMNS);
  // row 6 (D001): blank Deal ID, Closed status — recovered by row alignment.
  cl.getCell("J6").value = "Closed";
  cl.getCell("B7").value = "D002";
  cl.getCell("J7").value = "Open";
  cl.getCell("B8").value = "D005";
  cl.getCell("J8").value = "Open";

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
