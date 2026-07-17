import ExcelJS from "exceljs";
import type { Workbook, Worksheet } from "exceljs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type {
  CachedDealFigures,
  HeaderCheck,
  ParsedDeal,
  ParsedOverlay,
  ParsedPayment,
  ParsedSettings,
  RawWorkbook,
} from "./types";
import {
  COLLECTIBLE_COLUMNS,
  DEAL_COLUMNS,
  FIRST_DATA_ROW,
  HEADER_ROW,
  PAYMENT_COLUMNS,
  SETTINGS_LABELS,
  SHEETS,
  headerMatches,
  toCommBase,
  toCommissionBasis,
  toDealType,
  toIncentiveTaxable,
  toModeOfPayment,
  toPaymentType,
  toPropertyVatRule,
  toRepresentation,
  toReceivableStatus,
  toTransactionType,
  toYesBool,
} from "./mapping";
import {
  cellDateISO,
  cellNumberString,
  cellRateString,
  cellText,
} from "./xlsx";

/**
 * M1.4 — the workbook parser. Reads a v30.x ZETA workbook buffer into a RawWorkbook
 * of exact-decimal strings, validating the Deal Log / Payments / Collectibles header
 * text against the expected v30.13+ layout (mapping report) as it goes.
 *
 * ROW ALIGNMENT (WORKBOOK §5). The Collectibles sheet is one auto-row per deal in
 * the SAME row order as the Deal Log (both date-sorted). D001's Collectibles row —
 * like its Deal Log row — lost its ARRAYFORMULA cache (even the Deal ID mirror is
 * blank), so the overlay for each deal is read at the SAME ROW NUMBER as that deal
 * in the Deal Log, not by matching the (possibly blank) Collectibles Deal ID cell.
 */

const MAX_LIST_SCAN = 1010; // Deal Log capacity is 1,000 rows (rows 6–1005)

/**
 * Google-Sheets exports store cell notes with an ABSOLUTE relationship target
 * (`/xl/comments/comment1.xml`), which ExcelJS fails to reconcile (it keys its
 * comment map by the un-prefixed part name, so the lookup is undefined and load
 * throws). We do not read notes, so we strip the comment/vml relationships from
 * every worksheet's .rels before loading — a targeted, format-level fix that keeps
 * ExcelJS reading the real workbook. The original bytes are untouched (the
 * idempotency hash is taken from them upstream).
 */
function stripCommentRels(bytes: Uint8Array): Uint8Array {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    // Not a zip we can rewrite — hand the original bytes to ExcelJS, which will
    // give its own clear "not a workbook" error.
    return bytes;
  }
  let changed = false;
  for (const [name, data] of Object.entries(files)) {
    if (!/^xl\/worksheets\/_rels\/.*\.rels$/i.test(name)) continue;
    const xml = strFromU8(data);
    const stripped = xml.replace(
      /<Relationship\b[^>]*Target="[^"]*(?:comment|vml)[^"]*"[^>]*\/>/gi,
      ""
    );
    if (stripped !== xml) {
      files[name] = strToU8(stripped);
      changed = true;
    }
  }
  return changed ? zipSync(files) : bytes;
}

async function loadWorkbook(bytes: Uint8Array): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  const sanitized = stripCommentRels(bytes);
  // exceljs.load takes a Buffer/ArrayBuffer; a Uint8Array's buffer works.
  await wb.xlsx.load(sanitized as unknown as ArrayBuffer);
  return wb;
}

function sheet(wb: Workbook, name: string): Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    throw new Error(
      `This does not look like a v30.x ZETA workbook — the "${name}" sheet is missing.`
    );
  }
  return ws;
}

function norm(v: string): string {
  return v.trim().toLowerCase();
}

// --- Settings ---------------------------------------------------------------

/** Find the first row whose column-B label starts with `label`. */
function findLabelRow(
  ws: Worksheet,
  label: string,
  requireColC?: string
): number | null {
  for (let r = 1; r <= 260; r += 1) {
    if (headerMatches(label, cellText(ws, `B${r}`))) {
      if (requireColC && !headerMatches(requireColC, cellText(ws, `C${r}`))) continue;
      return r;
    }
  }
  return null;
}

function parseSettings(wb: Workbook): ParsedSettings {
  const ws = sheet(wb, SHEETS.settings);

  const taxRow = (label: string): number => {
    const r = findLabelRow(ws, label);
    if (r === null) {
      throw new Error(`Settings: the "${label}" row is missing.`);
    }
    return r;
  };
  const readTaxNumber = (label: string): string => {
    const value = cellNumberString(ws, `C${taxRow(label)}`);
    if (value === null) {
      throw new Error(`Settings: "${label}" has no value.`);
    }
    return value;
  };

  const tax = {
    vat_rate: readTaxNumber(SETTINGS_LABELS.vatRate),
    ewt_rate: readTaxNumber(SETTINGS_LABELS.ewtRate),
    property_vat_threshold: readTaxNumber(SETTINGS_LABELS.vatThreshold),
    chase_idle_months: Math.round(Number(readTaxNumber(SETTINGS_LABELS.chaseIdle))),
    // The workbook is a VAT-registered agent's book — every developer deal is
    // billed VAT-inclusive (D021 GCI = ÷1.12). There is no vat_registered cell in
    // v30.x (a SaaS addition), so it is inferred as true.
    vat_registered: true,
  };

  // Property types — the header row carries both "Property Type" and "VAT Rule".
  const ptHeader = findLabelRow(
    ws,
    SETTINGS_LABELS.propertyTypeHeader,
    "VAT Rule"
  );
  if (ptHeader === null) throw new Error("Settings: the Property Types list is missing.");
  const property_types = [];
  for (let r = ptHeader + 1; r <= ptHeader + 100; r += 1) {
    const name = cellText(ws, `B${r}`);
    if (name === "") break;
    property_types.push({ name, vat_rule: toPropertyVatRule(cellText(ws, `C${r}`)) });
  }

  // Developers — header row carries "Developer" and "Comm Base".
  const devHeader = findLabelRow(ws, SETTINGS_LABELS.developerHeader, "Comm Base");
  if (devHeader === null) throw new Error("Settings: the Developers list is missing.");
  const developers = [];
  for (let r = devHeader + 1; r <= devHeader + 100; r += 1) {
    const name = cellText(ws, `B${r}`);
    if (name === "") break;
    developers.push({ name, comm_base: toCommBase(cellText(ws, `C${r}`)) });
  }

  // Lead sources — the "Source" list header; blank rows are ignored (up to 50).
  let lsHeader: number | null = null;
  for (let r = 1; r <= 260; r += 1) {
    if (norm(cellText(ws, `B${r}`)) === norm(SETTINGS_LABELS.leadSourceHeader)) {
      lsHeader = r;
      break;
    }
  }
  if (lsHeader === null) throw new Error("Settings: the Lead Sources list is missing.");
  const lead_sources = [];
  for (let r = lsHeader + 1; r <= lsHeader + 60; r += 1) {
    const name = cellText(ws, `B${r}`);
    if (name !== "") lead_sources.push({ name });
  }

  return { tax, property_types, developers, lead_sources };
}

// --- Header validation (mapping report) -------------------------------------

function checkHeaders(
  ws: Worksheet,
  sheetName: string,
  columns: Record<string, { col: string; expected: string }>
): HeaderCheck[] {
  return Object.values(columns).map(({ col, expected }) => {
    const found = cellText(ws, `${col}${HEADER_ROW}`);
    return { sheet: sheetName, column: col, expected, found, ok: headerMatches(expected, found) };
  });
}

// --- Deal Log ---------------------------------------------------------------

function workbookPropertyVatToken(text: string): string | undefined {
  const n = norm(text).replace(/-/g, "");
  if (n === "") return undefined;
  if (n.startsWith("vatable")) return "vat_able";
  if (n.startsWith("exempt")) return "exempt";
  if (n === "n/a" || n === "na") return "n_a";
  return undefined;
}

function parseDeals(
  wb: Workbook,
  settings: ParsedSettings
): { deals: ParsedDeal[]; ws: Worksheet } {
  const ws = sheet(wb, SHEETS.dealLog);
  const C = DEAL_COLUMNS;

  const vatRuleByType = new Map(
    settings.property_types.map((p) => [norm(p.name), p.vat_rule])
  );
  const commBaseByDeveloper = new Map(
    settings.developers.map((d) => [norm(d.name), d.comm_base])
  );

  const cached = (ws: Worksheet, addr: string): string | undefined =>
    cellNumberString(ws, addr) ?? undefined;

  const deals: ParsedDeal[] = [];
  for (let r = FIRST_DATA_ROW; r <= MAX_LIST_SCAN; r += 1) {
    const deal_code = cellText(ws, `${C.deal_code.col}${r}`);
    if (deal_code === "") break;

    const property_type_name = cellText(ws, `${C.property_type.col}${r}`);
    const vat_rule = vatRuleByType.get(norm(property_type_name));
    if (!vat_rule) {
      throw new Error(
        `${deal_code}: property type "${property_type_name}" is not in the workbook's Settings.`
      );
    }

    const developerRaw = cellText(ws, `${C.developer.col}${r}`);
    const developer_name = developerRaw === "" ? null : developerRaw;
    let developer_comm_base = null;
    if (developer_name) {
      developer_comm_base = commBaseByDeveloper.get(norm(developer_name)) ?? null;
      if (!developer_comm_base) {
        throw new Error(
          `${deal_code}: developer "${developer_name}" is not in the workbook's Settings.`
        );
      }
    }

    const commission_basis = toCommissionBasis(cellText(ws, `${C.commission_basis.col}${r}`));
    let rate_pct: string | null = null;
    let fixed_amount: string | null = null;
    if (commission_basis === "percent") {
      rate_pct = cellRateString(ws, `${C.rate_pct.col}${r}`);
      if (rate_pct === null) throw new Error(`${deal_code}: percent basis with no rate.`);
    } else {
      fixed_amount = cellNumberString(ws, `${C.fixed_amount.col}${r}`);
      if (fixed_amount === null) throw new Error(`${deal_code}: fixed basis with no amount.`);
    }

    const list_price = cellNumberString(ws, `${C.list_price.col}${r}`);
    if (list_price === null) throw new Error(`${deal_code}: missing list price.`);
    const booked_date = cellDateISO(ws, `${C.booked_date.col}${r}`);
    if (booked_date === null) throw new Error(`${deal_code}: missing or invalid date.`);

    const cachedFigures: CachedDealFigures = {
      property_vat: workbookPropertyVatToken(cellText(ws, `${C.property_vat.col}${r}`)),
      net_list_price: cached(ws, `${C.net_list_price.col}${r}`),
      gci_net_of_vat: cached(ws, `${C.gci_net_of_vat.col}${r}`),
      incentive_net: cached(ws, `${C.incentive_net.col}${r}`),
      referral_out: cached(ws, `${C.referral_out.col}${r}`),
      net_gci: cached(ws, `${C.net_gci.col}${r}`),
      vat_memo: cached(ws, `${C.vat_memo.col}${r}`),
      ewt_memo: cached(ws, `${C.ewt_memo.col}${r}`),
      yield_on_list: cached(ws, `${C.yield_on_list.col}${r}`),
    };

    deals.push({
      row: r,
      deal_code,
      booked_date,
      transaction_type: toTransactionType(cellText(ws, `${C.transaction_type.col}${r}`)),
      deal_type: toDealType(cellText(ws, `${C.deal_type.col}${r}`)),
      developer_name,
      client_name: cellText(ws, `${C.client_name.col}${r}`),
      representation: toRepresentation(cellText(ws, `${C.representation.col}${r}`)),
      property_type_name,
      property_vat_rule: vat_rule,
      lead_source_name: cellText(ws, `${C.lead_source.col}${r}`),
      property_details: cellText(ws, `${C.property_details.col}${r}`),
      mode_of_payment: toModeOfPayment(cellText(ws, `${C.mode_of_payment.col}${r}`)),
      list_price,
      force_vat: toYesBool(cellText(ws, `${C.force_vat.col}${r}`)),
      commission_basis,
      rate_pct,
      fixed_amount,
      developer_comm_base,
      receipt_issued: toYesBool(cellText(ws, `${C.receipt_issued.col}${r}`)),
      incentive_billed: cellNumberString(ws, `${C.incentive_billed.col}${r}`) ?? "0",
      incentive_taxable: toIncentiveTaxable(cellText(ws, `${C.incentive_taxable.col}${r}`)),
      referral_out_pct: cellNumberString(ws, `${C.referral_out_pct.col}${r}`) ?? "0",
      referral_out_fixed: cellNumberString(ws, `${C.referral_out_fixed.col}${r}`) ?? "0",
      referral_paid: toYesBool(cellText(ws, `${C.referral_paid.col}${r}`)),
      cached: cachedFigures,
    });
  }

  return { deals, ws };
}

// --- Payments Log -----------------------------------------------------------

function parsePayments(wb: Workbook): ParsedPayment[] {
  const ws = sheet(wb, SHEETS.payments);
  const P = PAYMENT_COLUMNS;
  const payments: ParsedPayment[] = [];

  for (let r = FIRST_DATA_ROW; r <= MAX_LIST_SCAN; r += 1) {
    const deal_code = cellText(ws, `${P.deal_code.col}${r}`);
    if (deal_code === "") break;

    const gross_amount = cellNumberString(ws, `${P.gross_amount.col}${r}`);
    if (gross_amount === null) throw new Error(`Payment row ${r} (${deal_code}): missing gross.`);
    const payment_date = cellDateISO(ws, `${P.payment_date.col}${r}`);
    if (payment_date === null) throw new Error(`Payment row ${r} (${deal_code}): missing date.`);

    const note = cellText(ws, `${P.reference_note.col}${r}`);
    payments.push({
      row: r,
      deal_code,
      payment_date,
      gross_amount,
      payment_type: toPaymentType(cellText(ws, `${P.payment_type.col}${r}`)),
      reference_note: note === "" ? null : note,
      cached: {
        net_of_vat: cellNumberString(ws, `${P.net_of_vat.col}${r}`) ?? undefined,
        vat: cellNumberString(ws, `${P.vat.col}${r}`) ?? undefined,
        ewt: cellNumberString(ws, `${P.ewt.col}${r}`) ?? undefined,
        net_cash: cellNumberString(ws, `${P.net_cash.col}${r}`) ?? undefined,
      },
    });
  }

  return payments;
}

// --- Collectibles (overlays, row-aligned to the deals) ----------------------

function parseOverlays(wb: Workbook, deals: ParsedDeal[]): ParsedOverlay[] {
  const ws = sheet(wb, SHEETS.collectibles);
  const O = COLLECTIBLE_COLUMNS;

  return deals.map((deal) => {
    const r = deal.row; // Collectibles mirrors the Deal Log row order (§5).
    const statusText = cellText(ws, `${O.status.col}${r}`);
    // A blank status cell means Open (the sheet's default input state).
    const status = statusText === "" ? "open" : toReceivableStatus(statusText);
    const note = cellText(ws, `${O.note.col}${r}`);
    return {
      row: r,
      deal_code: deal.deal_code,
      status,
      confirmed: cellNumberString(ws, `${O.confirmed.col}${r}`),
      note: note === "" ? null : note,
      cached_total_collectible: cellNumberString(ws, `${O.total_collectible.col}${r}`) ?? undefined,
      cached_booked_net_gci: cellNumberString(ws, `${O.booked_net_gci.col}${r}`) ?? undefined,
    };
  });
}

// --- Entry point ------------------------------------------------------------

export async function parseWorkbook(bytes: Uint8Array): Promise<RawWorkbook> {
  const wb = await loadWorkbook(bytes);

  const settings = parseSettings(wb);
  const { deals, ws: dealWs } = parseDeals(wb, settings);
  if (deals.length === 0) {
    throw new Error("The workbook's Deal Log has no deals to import.");
  }
  const payments = parsePayments(wb);
  const overlays = parseOverlays(wb, deals);

  const headerChecks: HeaderCheck[] = [
    ...checkHeaders(dealWs, SHEETS.dealLog, DEAL_COLUMNS),
    ...checkHeaders(sheet(wb, SHEETS.payments), SHEETS.payments, PAYMENT_COLUMNS),
    ...checkHeaders(sheet(wb, SHEETS.collectibles), SHEETS.collectibles, COLLECTIBLE_COLUMNS),
  ];

  return { settings, deals, payments, overlays, headerChecks };
}
