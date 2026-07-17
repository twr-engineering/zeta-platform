import type { PaymentTypeEnum } from "@/types/entities";

/**
 * Human labels for the payment enums + the audit field labels (M5 §3.1, §6).
 *
 * ONE place, shared by the (M5.2/M5.3) list columns, type badges and the audit
 * viewer — a label that drifts between the log and the UI is how a spreadsheet's
 * meaning gets lost in translation.
 */

export const PAYMENT_TYPE_LABELS: Record<PaymentTypeEnum, string> = {
  commission: "Commission",
  incentive: "Incentive",
};

/** Field labels for the audit viewer (the payment mutations write these keys). */
export const PAYMENT_FIELD_LABELS: Record<string, string> = {
  deal_id: "Deal",
  payment_date: "Payment date",
  gross_amount: "Gross commission",
  payment_type: "Type",
  reference_note: "OR / invoice note",
  net_of_vat: "Net of VAT",
  vat_amount: "VAT",
  ewt_amount: "EWT",
  net_cash: "Net cash",
  retained_cash: "Retained cash",
  vat_basis_used: "VAT basis (captured)",
  ewt_rate_used: "EWT rate (captured)",
  vat_rate_used: "VAT rate (captured)",
  // archived_at intentionally omitted: the shared audit FIELD_LABELS map already
  // maps it to "Archived" (deals). A payment delete's archived_at old→new renders
  // as "Archived", which is accurate for a soft delete; the action badge says
  // "Deleted". Redefining it here would relabel deal archive events globally.
};
