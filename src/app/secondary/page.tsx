import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { TradeLifecycle } from "@/components/market-core/trade-lifecycle";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeskFigure, DeskLedger, DeskNote, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/config";
import { formatDemoKzt, formatInteger, formatTimestamp } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { marketTrail } from "@/lib/market-core/hierarchy";
import { getSecondaryMarketView } from "@/services/secondary-market-service";
import {
  getAssetProtocol,
  getProtocolVersion,
} from "@/services/market-core-service";
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
  // Market hierarchy derived from the traded instrument's own records — no
  // hardcoded protocol or instrument identifier.
  const marketProtocol = getAssetProtocol(view.instrument.assetProtocolId) ?? null;
  const marketVersion = view.instrument.protocolVersionId
    ? (getProtocolVersion(view.instrument.protocolVersionId) ?? null)
    : null;
  const latestTrade = view.trades[view.trades.length - 1];
  const book = [
    ...view.bids.map((level) => ({ side: "bids" as const, level })),
    ...view.asks.map((level) => ({ side: "asks" as const, level })),
  ];

  return (
    <div>
      <MarketCoreContextHeader
        level="MARKET"
        trail={marketTrail(view.instrument, marketProtocol, marketVersion, "title")}
        translate={tCore}
        title={t("title")}
        description={t("intro")}
        photo="/media/empty-silo-light.png"
        figure={
          <DeskFigure
            label={tCore("sectionMarket")}
            value={t("demoOpen")}
            meta={[
              {
                label: t("settlementAsset"),
                value: view.market.settlementAssetLabel,
              },
              {
                label: t("matchingActive"),
                value: t("settlementAwaiting"),
              },
            ]}
          />
        }
      />
      <DeskNote className="mb-4">{t("matchedNotSettled")}</DeskNote>
      <DeskNote className="mb-8">{t("pendingTransfer")}</DeskNote>
      {params.submitted ? <p className="mb-3 text-sm text-harvest">{t("submitted")}</p> : null}
      {params.cancelled ? <p className="mb-3 text-sm text-harvest">{t("cancelledNotice")}</p> : null}
      {params.error ? (
        <p className="mb-3 text-sm text-destructive">
          {t("errorGeneric")}: {params.error}
        </p>
      ) : null}

      <PageSection title={t("orderBook")} description={t("limitOnly")}>
        {book.length === 0 ? (
          <DeskNote>{t("emptyBook")}</DeskNote>
        ) : (
          <DeskLedger>
            {book.map((row, index) => (
              <DeskRow
                key={`${row.side}-${row.level.price}`}
                index={deskIndex(index)}
                kicker={t(row.side)}
                title={formatDemoKzt(row.level.price, locale)}
                value={formatInteger(row.level.quantity, locale)}
                hint={formatDemoKzt(row.level.total, locale)}
              />
            ))}
          </DeskLedger>
        )}
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
            buyDisclosure={<DeskNote>{t("noDirectFarmerOwnership")}</DeskNote>}
          />
        ) : (
          <EmptyState kicker={t("orderEntry")} title={t("viewOnly")} body={t("limitOnly")} />
        )}
      </PageSection>

      <PageSection title={t("myOrders")}>
        {view.myOrders.length === 0 ? (
          <DeskNote>{t("noOrders")}</DeskNote>
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
                        <input type="hidden" name="idempotencyKey" value={`cancel-${order.id}`} />
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
          <DeskNote>{t("noTrades")}</DeskNote>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("price")}</TableHead>
                <TableHead className="text-right">{t("qty")}</TableHead>
                <TableHead>{t("time")}</TableHead>
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
          <DeskNote>{t("noTrades")}</DeskNote>
        )}
      </PageSection>
    </div>
  );
}
