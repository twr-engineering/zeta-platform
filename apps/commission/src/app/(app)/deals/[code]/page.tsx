import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Receipt } from "lucide-react";

import { LockedValue } from "@/components/affordance/locked-value";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/sample/sample-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DealDetailActions } from "@/components/deals/deal-detail-actions";
import { DealAuditHistory } from "@/components/deals/deal-audit-history";
import { DealPaymentsPanel } from "@/components/payments/deal-payments-panel";
import { dealAuditHistory, getDealByCode } from "@/lib/deals/queries";
import { getWorkspaceRates, listPayments } from "@/lib/payments/queries";
import { getReceivableByDealId } from "@/lib/receivables/queries";
import {
  allDevelopers,
  allLeadSources,
  allPropertyTypes,
} from "@/lib/settings/list-queries";
import { formatManilaDate } from "@/lib/date/manila";
import { formatPHP, formatRateAsPercent, formatYield } from "@/lib/money";
import { dealEditPath, paymentNewPath, ROUTES } from "@/lib/routes";
import {
  COMMISSION_BASIS_LABELS,
  COMM_BASE_DISPLAY_LABELS,
  DEAL_TYPE_LABELS,
  INCENTIVE_TAXABLE_LABELS,
  MODE_OF_PAYMENT_LABELS,
  PROPERTY_VAT_LABELS,
  REPRESENTATION_LABELS,
  TRANSACTION_TYPE_LABELS,
  VAT_BASIS_LABELS,
} from "@/lib/deals/labels";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return { title: code };
}

/**
 * Deal detail (FR-M1-02): inputs vs computed, the computed figures locked with
 * their formulas on hover (M10). Cross-links reach the payment and receivable
 * surfaces (placeholders until M4/M5), and the deal's own audit history sits
 * below. Archive / restore / delete live in the client actions header.
 */
export default async function DealDetailPage({ params }: PageProps) {
  const { code } = await params;
  const deal = await getDealByCode(code);
  if (!deal) notFound();

  const [developers, propertyTypes, leadSources, history, payments, receivable, currentRates] =
    await Promise.all([
      allDevelopers(),
      allPropertyTypes(),
      allLeadSources(),
      dealAuditHistory(deal.id),
      listPayments({ dealId: deal.id }),
      getReceivableByDealId(deal.id),
      getWorkspaceRates(),
    ]);

  const developerName = deal.developer_id
    ? developers.find((d) => d.id === deal.developer_id)?.name ?? "—"
    : "—";
  const propertyTypeName =
    propertyTypes.find((p) => p.id === deal.property_type_id)?.name ?? "—";
  const leadSourceName =
    leadSources.find((s) => s.id === deal.lead_source_id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {deal.deal_code}
            </h1>
            {deal.is_sample && <SampleBadge />}
            {deal.archived_at && <Badge variant="secondary">Archived</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {deal.client_name} · {formatManilaDate(deal.booked_date)}
          </p>
        </div>
        <DealDetailActions id={deal.id} code={deal.deal_code} archived={!!deal.archived_at} />
      </header>

      {/* Headline + cross-links */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm text-muted-foreground">NET GCI — what you earn</p>
            <LockedValue
              size="lg"
              formula="NET GCI = GCI + Incentive (net) − Referral Out"
              data-testid="detail-net-gci"
              className="mt-1 text-xl"
            >
              {formatPHP(deal.net_gci)}
            </LockedValue>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={paymentNewPath(deal.id)} />}
              data-testid="link-log-payment"
            >
              <Banknote className="size-4" /> Log a payment
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={ROUTES.collectibles} />}
              data-testid="link-view-receivable"
            >
              <Receipt className="size-4" /> View receivable
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>What you entered</CardTitle>
            <CardDescription>The deal&apos;s inputs — edit them to restate the figures.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <Item label="Transaction">{TRANSACTION_TYPE_LABELS[deal.transaction_type]}</Item>
              <Item label="Deal type">{DEAL_TYPE_LABELS[deal.deal_type]}</Item>
              {deal.developer_id && <Item label="Developer">{developerName}</Item>}
              <Item label="Representation">{REPRESENTATION_LABELS[deal.representation]}</Item>
              <Item label="Property type">{propertyTypeName}</Item>
              <Item label="Lead source">{leadSourceName}</Item>
              <Item label="Property details" wide>{deal.property_details}</Item>
              <Item label="Mode of payment">{MODE_OF_PAYMENT_LABELS[deal.mode_of_payment]}</Item>
              <Item label="List price">{formatPHP(deal.list_price)}</Item>
              {deal.deal_type === "developer" && (
                <Item label="Force VAT">{deal.force_vat ? "Yes" : "No"}</Item>
              )}
              <Item label="Basis">{COMMISSION_BASIS_LABELS[deal.commission_basis]}</Item>
              <Item label="Rate / Fixed">
                {deal.commission_basis === "percent"
                  ? deal.rate_pct?.includes("/")
                    ? `${deal.rate_pct} of annual rent`
                    : formatRateAsPercent(deal.rate_pct ?? "0")
                  : formatPHP(deal.fixed_amount ?? "0")}
              </Item>
              <Item label="Receipt issued">{deal.receipt_issued ? "Yes" : "No"}</Item>
              <Item label="Incentive (billed)">{formatPHP(deal.incentive_billed)}</Item>
              <Item label="Incentive taxable">
                {INCENTIVE_TAXABLE_LABELS[deal.incentive_taxable ?? "blank"]}
              </Item>
              <Item label="Referral out %">{formatRateAsPercent(deal.referral_out_pct)}</Item>
              <Item label="Referral out (fixed)">{formatPHP(deal.referral_out_fixed)}</Item>
              <Item label="Referral paid">{deal.referral_paid ? "Yes" : "No"}</Item>
            </dl>
          </CardContent>
        </Card>

        {/* Computed */}
        <Card>
          <CardHeader>
            <CardTitle>What the engine computed</CardTitle>
            <CardDescription>Locked figures — hover any value for its formula.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="secondary">Property VAT: {PROPERTY_VAT_LABELS[deal.property_vat]}</Badge>
              <Badge variant="secondary">Commission base: {COMM_BASE_DISPLAY_LABELS[deal.comm_base]}</Badge>
              <Badge variant="secondary">VAT basis: {VAT_BASIS_LABELS[deal.vat_basis]}</Badge>
            </div>
            <dl className="space-y-2">
              <Computed label="Net List Price" formula="Net List = List Price ÷ (1 + VAT rate) when VAT-able; else = List Price" testId="detail-net-list">
                {formatPHP(deal.net_list_price)}
              </Computed>
              <Computed label="Billed commission" formula="Billed = Rate × base price (or the fixed amount)" testId="detail-billed">
                {formatPHP(deal.billed_commission)}
              </Computed>
              <Computed label="GCI (net of VAT)" formula="GCI = billed ÷ (1 + VAT rate) on a taxable deal; = billed when untaxed" testId="detail-gci">
                {formatPHP(deal.gci_net_of_vat)}
              </Computed>
              <Computed label="Incentive (net)" formula="Incentive net = billed ÷ (1 + VAT rate) when taxable; as-is otherwise" testId="detail-incentive-net">
                {formatPHP(deal.incentive_net)}
              </Computed>
              <Computed label="Referral out" formula="Referral Out = % × billed commission + fixed amount" testId="detail-referral-out">
                {formatPHP(deal.referral_out)}
              </Computed>
              <Computed label="NET GCI" formula="NET GCI = GCI + Incentive (net) − Referral Out" testId="detail-computed-net-gci">
                {formatPHP(deal.net_gci)}
              </Computed>
              <Computed label="VAT (memo)" formula="VAT memo = (GCI + taxable incentive) × VAT rate; 0 when untaxed" testId="detail-vat-memo">
                {formatPHP(deal.vat_memo)}
              </Computed>
              <Computed label="EWT (memo)" formula="EWT memo = (GCI + taxable incentive) × EWT rate; 0 when untaxed" testId="detail-ewt-memo">
                {formatPHP(deal.ewt_memo)}
              </Computed>
              <Computed label="Yield on list" formula="Yield = NET GCI ÷ List Price" testId="detail-yield">
                {formatYield(deal.yield_on_list)}
              </Computed>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Payment history + running total (the unified per-deal panel, M5.3 §6.3) */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Every release logged against this deal, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <DealPaymentsPanel
            payments={payments}
            dealId={deal.id}
            collectedNet={receivable?.collected_net ?? null}
            totalCollectible={receivable?.total_collectible ?? null}
            pctCollected={receivable?.pct_collected ?? null}
            currentRates={currentRates}
          />
        </CardContent>
      </Card>

      {/* Audit history */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every change to this deal, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <DealAuditHistory entries={history} />
        </CardContent>
      </Card>

      <div className="lg:hidden">
        <Button className="w-full" nativeButton={false} render={<Link href={dealEditPath(deal.deal_code)} />}>
          Edit this deal
        </Button>
      </div>
    </div>
  );
}

function Item({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Computed({
  label,
  formula,
  testId,
  children,
}: {
  label: string;
  formula: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <LockedValue formula={formula} align="end" data-testid={testId}>
          {children}
        </LockedValue>
      </dd>
    </div>
  );
}
