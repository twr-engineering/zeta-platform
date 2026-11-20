import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, FileText } from "lucide-react";

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
import { HelpPopover } from "@/components/help/help-popover";
import { ReceivableControls } from "@/components/receivables/receivable-controls";
import { DealPaymentsPanel } from "@/components/payments/deal-payments-panel";
import { ReceivableTimeline } from "@/components/receivables/receivable-timeline";
import { RestatedOverrideBanner } from "@/components/receivables/restated-override-banner";
import {
  getReceivableByDealCode,
  receivableAuditHistory,
  receivablePayor,
} from "@/lib/receivables/queries";
import { getDealByCode } from "@/lib/deals/queries";
import { getWorkspaceRates, listPayments } from "@/lib/payments/queries";
import { formatManilaDate } from "@/lib/date/manila";
import { formatPHP, formatRateAsPercent } from "@/lib/money";
import { dealDetailPath, paymentNewPath, ROUTES } from "@/lib/routes";

type PageProps = { params: Promise<{ dealCode: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { dealCode } = await params;
  return { title: `${dealCode} — Collectible` };
}

const STATUS_LABEL = { open: "Open", closed: "Closed", cancelled: "Cancelled" } as const;

/**
 * The receivable detail (FR-M4-09, §6): the booked-vs-collectible explainer (Rule
 * K.2 doctrine, verbatim), the inputs the agent controls (status transitions,
 * Confirmed Collectible override, Next Action note, the "Adjust…" Corrections flow)
 * beside the locked computed money, the payment history (read-only, from M5), and
 * the status timeline. Cross-links reach the deal (M1) and "Log a payment" (M5).
 */
export default async function CollectibleDetailPage({ params }: PageProps) {
  const { dealCode } = await params;
  const receivable = await getReceivableByDealCode(dealCode);
  if (!receivable) notFound();

  const [deal, payments, history, currentRates] = await Promise.all([
    getDealByCode(dealCode),
    listPayments({ dealId: receivable.deal_id }),
    receivableAuditHistory(receivable.id),
    getWorkspaceRates(),
  ]);

  const negativeBalance =
    receivable.balance !== null && Number(receivable.balance) < 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {receivable.deal_code}
            </h1>
            {receivable.is_sample && <SampleBadge />}
            <Badge variant="outline">{STATUS_LABEL[receivable.status]}</Badge>
            {receivable.archived_at && <Badge variant="secondary">Archived</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {receivablePayor(receivable)} · booked {formatManilaDate(receivable.booking_date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={paymentNewPath(receivable.deal_id)} />}
            data-testid="link-log-payment"
          >
            <Banknote className="size-4" /> Log a payment
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={dealDetailPath(receivable.deal_code)} />}
            data-testid="link-view-deal"
          >
            <FileText className="size-4" /> View deal
          </Button>
        </div>
      </header>

      {receivable.override_review_flagged_at !== null && (
        <RestatedOverrideBanner
          id={receivable.id}
          editedAt={receivable.override_review_flagged_at}
          confirmedCollectible={receivable.confirmed_collectible}
        />
      )}

      {/* Booked vs collectible explainer — the module's most-misread rule */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>Booked NET GCI vs Total Collectible</CardTitle>
            <HelpPopover
              placement="receivable.header"
              label="About Booked vs Collectible"
              testId="help-receivable-header"
            />
          </div>
          <CardDescription>
            Booked NET GCI = earned after referral-outs; Total Collectible = full cash you expect in
            (you pay referrers separately — tracked on the Dashboard).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Booked NET GCI — what you earn</p>
            <LockedValue
              size="lg"
              className="mt-1"
              formula="Booked NET GCI = GCI (net of VAT) + Incentive (net) − Referral Out"
              data-testid="detail-booked-net-gci"
            >
              {formatPHP(receivable.booked_net_gci)}
            </LockedValue>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Collectible — full cash in</p>
            <LockedValue
              size="lg"
              className="mt-1"
              formula="Total Collectible = Confirmed Collectible if set, else GCI (net of VAT) + Incentive (net)"
              data-testid="detail-total-collectible"
            >
              {formatPHP(receivable.total_collectible)}
            </LockedValue>
            {deal && (
              <p className="mt-1.5 text-xs text-muted-foreground" data-testid="collectible-arithmetic">
                GCI {formatPHP(deal.gci_net_of_vat)} + incentive {formatPHP(deal.incentive_net)} ={" "}
                {formatPHP(receivable.default_total_collectible)}
                {receivable.confirmed_collectible !== null &&
                  ` · confirmed override ${formatPHP(receivable.confirmed_collectible)}`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs — what the agent can change */}
        <Card>
          <CardHeader>
            <CardTitle>What you can change</CardTitle>
            <CardDescription>
              Status, the Confirmed Collectible override, and your Next Action. Money is otherwise
              locked and computed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReceivableControls
              id={receivable.id}
              dealCode={receivable.deal_code}
              status={receivable.status}
              version={receivable.version}
              balance={receivable.balance}
              collectedNet={receivable.collected_net}
              totalCollectible={receivable.total_collectible}
              defaultTotalCollectible={receivable.default_total_collectible}
              confirmedCollectible={receivable.confirmed_collectible}
              nextActionNote={receivable.next_action_note}
            />
          </CardContent>
        </Card>

        {/* Computed — locked money with formula tooltips */}
        <Card>
          <CardHeader>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Locked figures — hover any value for its formula.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <Computed label="Collected (Net of VAT)" formula="Collected = Σ payment Net of VAT (commission and incentive both count)" testId="detail-collected">
                {formatPHP(receivable.collected_net)}
              </Computed>
              <Computed
                label="Balance"
                formula="Balance = Total Collectible − Collected (Net of VAT); negative means over-collected"
                testId="detail-balance"
                warn={negativeBalance}
              >
                {receivable.balance === null ? "—" : formatPHP(receivable.balance)}
              </Computed>
              <Computed label="% Collected" formula="% Collected = Collected ÷ Total Collectible" testId="detail-pct">
                {receivable.pct_collected === null ? "—" : formatRateAsPercent(receivable.pct_collected)}
              </Computed>
              {receivable.status === "closed" && (
                <Computed label="Variance" formula="Variance = Collected − Total Collectible (frozen at close)" testId="detail-variance">
                  {receivable.variance === null ? "—" : formatPHP(receivable.variance)}
                </Computed>
              )}
              {receivable.status === "cancelled" && (
                <Computed label="Written off" formula="Written off = Total Collectible − Collected at cancellation (cash kept)" testId="detail-written-off">
                  {receivable.written_off === null ? "—" : formatPHP(receivable.written_off)}
                </Computed>
              )}
              <Computed label="Last payment" formula="Most recent payment date" testId="detail-last-payment">
                {receivable.last_payment_date ? formatManilaDate(receivable.last_payment_date) : "—"}
              </Computed>
              <Computed
                label="Months idle"
                formula="Whole months since the last payment; blank when Closed/Cancelled or never paid"
                testId="detail-idle"
              >
                {receivable.months_idle === null
                  ? receivable.status === "open"
                    ? "no payment yet"
                    : "—"
                  : receivable.months_idle}
              </Computed>
              <Computed
                label="Days to 1st release"
                formula="First payment date − booking date (negative allowed)"
                testId="detail-days-to-first"
              >
                {receivable.days_to_first_release === null ? "—" : receivable.days_to_first_release}
              </Computed>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Payment history + running total (the unified per-deal panel, M5.3 §6.3) */}
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>Every release logged against this deal, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <DealPaymentsPanel
            payments={payments}
            dealId={receivable.deal_id}
            collectedNet={receivable.collected_net}
            totalCollectible={receivable.total_collectible}
            pctCollected={receivable.pct_collected}
            currentRates={currentRates}
          />
        </CardContent>
      </Card>

      {/* Status timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Status timeline</CardTitle>
          <CardDescription>Every change to this receivable, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReceivableTimeline entries={history} />
        </CardContent>
      </Card>

      <div className="lg:hidden">
        <Button className="w-full" variant="outline" nativeButton={false} render={<Link href={ROUTES.collectibles} />}>
          Back to Collectibles
        </Button>
      </div>
    </div>
  );
}

function Computed({
  label,
  formula,
  testId,
  warn,
  children,
}: {
  label: string;
  formula: string;
  testId: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <LockedValue
          formula={formula}
          data-testid={testId}
          className={warn ? "text-destructive" : undefined}
        >
          {children}
        </LockedValue>
      </dd>
    </div>
  );
}
