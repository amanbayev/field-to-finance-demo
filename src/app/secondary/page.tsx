import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { InstrumentDisclosure } from "@/components/market-core/instrument-disclosure";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { TradeLifecycle } from "@/components/market-core/trade-lifecycle";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { tokens } from "@/data/mock/tokens";
import type { AppLocale } from "@/i18n/config";
import { formatDemoKzt, formatInteger, formatTimestamp } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { getSecondaryMarketView } from "@/services/secondary-market-service";
import { OrderEntry } from "./order-entry";
import { cancelSecondaryOrderAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("secondary");
  return { title: t("title") };
}

export default async function SecondaryMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string; cancelled?: string }>;
}) {
  const actor = await requirePermission("market.read");
  const params = await searchParams;
  const t = await getTranslations("secondary");
  const tCore = await getTranslations("marketCore");
  const locale = (await getLocale()) as AppLocale;
  const view = await getSecondaryMarketView(actor);
  const wheat = tokens[0]!;
  const coverage = wheatPoolCoverageFromEngine();
  const latestTrade = view.trades[view.trades.length - 1];

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={`${view.instrument.symbol} · ${t("title")}`}
        description={t("intro")}
      />
      <p className="mb-4 text-sm text-muted-foreground">{t("matchedNotSettled")}</p>
      <p className="mb-4 text-xs text-muted-foreground">{t("pendingTransfer")}</p>
      {params.submitted ? (
        <p className="mb-3 text-sm text-primary">{t("submitted")}</p>
      ) : null}
      {params.cancelled ? (
        <p className="mb-3 text-sm text-primary">{t("cancelledNotice")}</p>
      ) : null}
      {params.error ? (
        <p className="mb-3 text-sm text-destructive">{t("errorGeneric")}: {params.error}</p>
      ) : null}

      <dl className="mb-6 grid gap-3 border border-border bg-card px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="label-caps text-muted-foreground">{t("instrument")}</dt>
          <dd className="font-medium">{view.instrument.symbol}</dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">{t("protocol")}</dt>
          <dd>Field to Finance</dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">{t("issuer")}</dt>
          <dd>{view.instrument.issuerName}</dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">{t("settlementAsset")}</dt>
          <dd>
            {view.market.settlementAssetLabel}
            <span className="mt-1 block text-xs text-muted-foreground">{t("noMonetaryValue")}</span>
          </dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">{t("marketId")}</dt>
          <dd className="font-tabular text-xs">{view.market.id}</dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">{t("marketStatus")}</dt>
          <dd>
            <MarketStatusChip label={t("demoOpen")} tone="SECONDARY_OPEN" />
            <span className="mt-1 block text-xs text-muted-foreground">{t("matchingActive")}</span>
            <span className="block text-xs text-muted-foreground">{t("settlementAwaiting")}</span>
          </dd>
        </div>
      </dl>

      <MarketClearingSplit
        distinction={tCore("clearingDistinct")}
        marketTitle={tCore("marketFlow")}
        clearingTitle={tCore("clearingFlow")}
        marketSteps={[tCore("order"), tCore("matching"), tCore("trade")]}
        clearingSteps={[
          tCore("trade"),
          tCore("eligibilityRecheck"),
          tCore("dvp"),
          tCore("finalSettlement"),
        ]}
      />

      <PageSection title={t("orderBook")} description={t("limitOnly")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs tracking-wide text-muted-foreground">{t("bids")}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("price")}</TableHead>
                  <TableHead className="text-right">{t("qty")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.bids.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>{t("emptyBook")}</TableCell>
                  </TableRow>
                ) : (
                  view.bids.map((level) => (
                    <TableRow key={`bid-${level.price}`}>
                      <TableCell className="font-tabular">{formatDemoKzt(level.price, locale)}</TableCell>
                      <TableCell className="text-right font-tabular">
                        {formatInteger(level.quantity, locale)}
                      </TableCell>
                      <TableCell className="text-right font-tabular">
                        {formatDemoKzt(level.total, locale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 text-xs tracking-wide text-muted-foreground">{t("asks")}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("price")}</TableHead>
                  <TableHead className="text-right">{t("qty")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.asks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>{t("emptyBook")}</TableCell>
                  </TableRow>
                ) : (
                  view.asks.map((level) => (
                    <TableRow key={`ask-${level.price}`}>
                      <TableCell className="font-tabular">{formatDemoKzt(level.price, locale)}</TableCell>
                      <TableCell className="text-right font-tabular">
                        {formatInteger(level.quantity, locale)}
                      </TableCell>
                      <TableCell className="text-right font-tabular">
                        {formatDemoKzt(level.total, locale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </PageSection>

      <PageSection title={t("orderEntry")} description={t("wholeTokens")}>
        {view.canSubmit || view.participantId ? (
          <OrderEntry
            canSubmit={view.canSubmit}
            availableQty={view.holding?.available ?? 0}
            availableCash={view.cash?.available ?? 0}
            eligibilityLabel={t("eligibility")}
            eligibilityValue={view.eligibility}
            quantityLabel={t("quantity")}
            priceLabel={t("limitPrice")}
            estimatedLabel={t("estimatedTotal")}
            availableAssetLabel={t("availableWheat")}
            availableCashLabel={t("availableDemoKzt")}
            buyLabel={t("buy")}
            sellLabel={t("sell")}
            submitLabel={t("submitOrder")}
            disclaimer={t("noMonetaryValue")}
            buyDisclosure={
              <InstrumentDisclosure
                title={t("disclosureTitle")}
                items={[
                  { label: t("issuer"), value: wheat.issuerName },
                  { label: t("instrumentRight"), value: wheat.tokenUnitDescription },
                  { label: t("deliveryWindow"), value: wheat.terms.redemptionWindow },
                  { label: t("assetProtocol"), value: "Field to Finance" },
                  { label: t("backingPool"), value: wheat.poolId },
                  {
                    label: t("gross"),
                    value: `${formatInteger(coverage.grossVolumeTonnes, locale)} t`,
                  },
                  {
                    label: t("eligibleCoverage"),
                    value: `${formatInteger(coverage.eligibleCoverageTonnes, locale)} t`,
                  },
                  {
                    label: t("riskModel"),
                    value: t("riskModelValue"),
                  },
                  { label: t("monitoring"), value: t("monitoringValue") },
                  { label: t("insuranceStatus"), value: t("insuranceValue") },
                ]}
                coverageDisclaimer={t("coverageNotGuarantee")}
                claimDisclaimer={t("noDirectFarmerOwnership")}
              />
            }
          />
        ) : (
          <EmptyState>{t("viewOnly")}</EmptyState>
        )}
      </PageSection>

      <PageSection title={t("myOrders")}>
        {view.myOrders.length === 0 ? (
          <EmptyState>{t("noOrders")}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("side")}</TableHead>
                <TableHead className="text-right">{t("qty")}</TableHead>
                <TableHead className="text-right">{t("remaining")}</TableHead>
                <TableHead className="text-right">{t("price")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.myOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.side === "BUY" ? t("buy") : t("sell")}</TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(order.originalQuantity, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(order.remainingQuantity, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatDemoKzt(order.price, locale)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={order.status} />
                  </TableCell>
                  <TableCell>
                    {view.canSubmit &&
                    view.participantId === order.participantId &&
                    (order.status === "OPEN" || order.status === "PARTIALLY_FILLED") ? (
                      <form action={cancelSecondaryOrderAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <Button variant="ghost" size="xs" type="submit">
                          {t("cancel")}
                        </Button>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      <PageSection title={t("recentTrades")}>
        {view.trades.length === 0 ? (
          <EmptyState>{t("noTrades")}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("price")}</TableHead>
                <TableHead className="text-right">{t("qty")}</TableHead>
                <TableHead>{t("time")}</TableHead>
                <TableHead>{t("matched")}</TableHead>
                <TableHead>{t("clearing")}</TableHead>
                <TableHead>{t("settlement")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...view.trades].reverse().map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-tabular">{formatDemoKzt(trade.price, locale)}</TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(trade.quantity, locale)}
                  </TableCell>
                  <TableCell className="text-xs">{formatTimestamp(trade.createdAt, locale)}</TableCell>
                  <TableCell>
                    <StatusBadge value="MATCHED" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={
                        trade.eligibilityRecheckPassed ? "CLEARING_READY" : "MATCHED"
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={trade.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      <PageSection title={t("clearingStatus")} description={t("awaitingDevnet")}>
        {latestTrade ? (
          <TradeLifecycle
            eligibilityPassed={latestTrade.eligibilityRecheckPassed}
            pendingLabel={t("pending")}
            confirmedLabel={t("confirmed")}
            labels={{
              matched: t("matched"),
              eligibilityRecheck: tCore("eligibilityRecheck"),
              sellerReservation: tCore("sellerReservation"),
              buyerReservation: tCore("buyerReservation"),
              dvp: tCore("dvp"),
              registryUpdate: tCore("registryUpdate"),
              finalSettlement: tCore("finalSettlement"),
            }}
          />
        ) : (
          <EmptyState>{t("noTrades")}</EmptyState>
        )}
      </PageSection>
    </div>
  );
}
