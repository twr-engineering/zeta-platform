import { Money, rateToPercent } from "@/lib/money";
import type { Deal } from "@/types/entities";
import type { DealFormValues } from "@/components/deals/deal-form";

/**
 * Deal row ⇄ form values. The form speaks camelCase percent-friendly strings;
 * the row speaks DB tokens and decimal rates. Two conversions matter:
 *  - a stored rate "0.05" must display as "5" (a percent), and "1/12" stays
 *    "1/12" — otherwise editing a 5% deal would re-read as 0.05% (§4 rule 17);
 *  - `incentive_taxable` null (blank = Yes) becomes the "blank" option.
 */

/** Stored decimal rate → the percent string the form shows ("0.05" → "5"). */
function rateToDisplay(rate: string | null): string {
  if (!rate) return "";
  if (rate.includes("/")) return rate; // exact fraction, kept verbatim
  return new Money(rateToPercent(rate).toString()).toString();
}

export function emptyDealValues(bookedDate: string): DealFormValues {
  return {
    bookedDate,
    transactionType: "sale",
    dealType: "",
    developerId: "",
    clientName: "",
    representation: "",
    propertyTypeId: "",
    leadSourceId: "",
    propertyDetails: "",
    modeOfPayment: "",
    listPrice: "",
    forceVat: false,
    commissionBasis: "percent",
    rate: "",
    fixedAmount: "",
    receiptIssued: false,
    incentiveBilled: "0",
    incentiveTaxable: "blank",
    referralOutPct: "0",
    referralOutFixed: "0",
    referralPaid: false,
  };
}

export function dealToFormValues(deal: Deal): DealFormValues {
  return {
    bookedDate: deal.booked_date,
    transactionType: deal.transaction_type,
    dealType: deal.deal_type,
    developerId: deal.developer_id ?? "",
    clientName: deal.client_name,
    representation: deal.representation,
    propertyTypeId: deal.property_type_id,
    leadSourceId: deal.lead_source_id,
    propertyDetails: deal.property_details,
    modeOfPayment: deal.mode_of_payment,
    listPrice: deal.list_price,
    forceVat: deal.force_vat,
    commissionBasis: deal.commission_basis,
    rate: deal.commission_basis === "percent" ? rateToDisplay(deal.rate_pct) : "",
    fixedAmount: deal.fixed_amount ?? "",
    receiptIssued: deal.receipt_issued,
    incentiveBilled: deal.incentive_billed,
    incentiveTaxable: deal.incentive_taxable ?? "blank",
    referralOutPct: new Money(rateToPercent(deal.referral_out_pct).toString()).toString(),
    referralOutFixed: deal.referral_out_fixed,
    referralPaid: deal.referral_paid,
  };
}
