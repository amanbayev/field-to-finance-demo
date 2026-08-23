import Link from "next/link";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/institutional/breadcrumbs";
import { ContextTabs } from "@/components/institutional/context-tabs";
import { EmptyState } from "@/components/institutional/empty-state";
import { EntityHeader } from "@/components/institutional/entity-header";
import { FactList } from "@/components/institutional/fact-list";
import { MarketToolbar } from "@/components/institutional/market/market-toolbar";
import { OrderBook } from "@/components/institutional/market/order-book";
import { PlaceOrder } from "@/components/institutional/market/place-order";
import { WorkstationPanel } from "@/components/institutional/market/workstation-panel";
import { ProtocolBadge } from "@/components/institutional/protocol-badge";
import { StatusChip } from "@/components/institutional/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import {
  formatDemoKzt,
  formatInteger,
  formatUtcDate,
  formatUtcTime,
} from "@/lib/format";
import type { MarketWorkstationModel } from "@/lib/institutional/load-market-workstation";
import {
  DEFAULT_MARKET_WORKSTATION_BASE,
  MARKET_WORKSTATION_TABS,
  marketWorkstationHref,
  type MarketWorkstationTab,
} from "@/lib/institutional/tabs";
import { ASSET_CLASS_KEYS } from "@/lib/market-core/presentation";
import { cancelUiV2SecondaryOrderAction } from "@/app/ui-v2/markets/actions";
import { cn } from "@/lib/utils";

const CHART_RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;

function formatPrice(price: number, locale: AppLocale, decimals: number): string {
  if (decimals <= 0) {
    return formatInteger(price, locale);
  }
  return formatInteger(price, locale);
}

export async function MarketWorkstationScreen({
  model,
  tab,
  locale,
  basePath = DEFAULT_MARKET_WORKSTATION_BASE,
  reviewMode = false,
  notice,
}: {
  model: MarketWorkstationModel;
  tab: MarketWorkstationTab;
  locale: AppLocale;
  basePath?: string;
  reviewMode?: boolean;
  notice?: "submitted" | "cancelled" | "error" | null;
}) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  const { market, instrument, protocol } = model;
  const open =
    market.demonstratorStatus === "DEMO_OPEN" && market.transacting && market.matchingEnabled;
  const tabItems = MARKET_WORKSTATION_TABS.map((id) => ({
    href: marketWorkstationHref(market.id, id, basePath),
    label: lookupMessage(t, `workstation.tabs.${id}`),
    current: tab === id,
  }));
  const asOf = model.asOf;

  return (
    <div>
      {reviewMode ? null : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-[#F1F4F1] px-3 py-1.5 text-[12px] text-muted-foreground">
          <span>{t("previewBanner")}</span>
          <Link href={model.classicHref} className="font-medium text-primary hover:underline">
            {t("workstation.classicMarket")}
          </Link>
        </div>
      )}
      {notice === "submitted" ? (
        <p className="mb-3 text-sm text-primary">{t("workstation.submitted")}</p>
      ) : null}
      {notice === "cancelled" ? (
        <p className="mb-3 text-sm text-primary">{t("workstation.cancelled")}</p>
      ) : null}
      {notice === "error" ? (
        <p className="mb-3 text-sm text-destructive">{t("workstation.error")}</p>
      ) : null}

      <EntityHeader
        compact
        breadcrumbs={
          <Breadcrumbs
            items={[
              { href: "/markets", label: t("breadcrumbMarkets") },
              {
                href: model.protocol ? `/protocols/${model.protocol.id}` : undefined,
                label: protocol?.name ?? instrument.assetProtocolId,
              },
              { href: model.instrumentHref, label: t("nav.instruments") },
              { href: model.instrumentHref, label: instrument.symbol },
              { label: t("workstation.tabs.market"), current: true },
            ]}
          />
        }
        title={market.id}
        badges={
          <StatusChip
            family="market"
            code={open ? "OPEN" : market.demonstratorStatus}
            label={open ? t("statusOpen") : t("statusClosed")}
            className="uppercase tracking-[0.08em]"
          />
        }
        context={t("workstation.secondaryMarket")}
        eyebrow={`${instrument.symbol}${model.cropQuality ? ` (${model.cropQuality})` : ""}`}
      />

      <div className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5">
        {protocol ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF4EE] px-2 py-0.5 text-[11px] font-medium text-[#0B5D3B]">
            <Leaf className="size-3" aria-hidden />
            {t("workstation.protocolTag", { name: protocol.name })}
          </span>
        ) : null}
        <ProtocolBadge assetClass={instrument.assetClass} className="bg-amber-50 text-amber-900">
          {lookupMessage(tCore, ASSET_CLASS_KEYS[instrument.assetClass])}
        </ProtocolBadge>
        {model.cropQuality ? (
          <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900">
            {model.cropQuality}
          </span>
        ) : null}
        <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] text-[#59645D]">
          {market.settlementAssetLabel}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric
          label={t("workstation.lastPrice")}
          value={
            model.lastPrice !== null
              ? formatPrice(model.lastPrice, locale, instrument.decimals)
              : t("none")
          }
          hint={
            model.lastTrade
              ? `DEMO-KZT · ${t("workstation.lastMatchedHint")}`
              : t("noTrades")
          }
        />
        <Metric
          label={t("workstation.volume24h")}
          value={t("none")}
          hint={
            model.matchedQuantity !== null && model.matchedQuantity > 0
              ? t("workstation.sessionMatchedShort", {
                  qty: formatInteger(model.matchedQuantity, locale),
                  notional: formatDemoKzt(model.matchedNotional ?? 0, locale),
                })
              : t("workstation.noVolumeSeries")
          }
        />
        <Metric
          label={t("bestBid")}
          value={
            model.bestBid ? (
              <span className="text-[#0B5D3B]">
                {formatPrice(model.bestBid.price, locale, instrument.decimals)}
              </span>
            ) : (
              t("none")
            )
          }
          hint={
            model.bestBid
              ? t("workstation.tokensHint", { qty: formatInteger(model.bestBid.quantity, locale) })
              : t("workstation.noBids")
          }
        />
        <Metric
          label={t("bestAsk")}
          value={
            model.bestAsk ? (
              <span className="text-red-700">
                {formatPrice(model.bestAsk.price, locale, instrument.decimals)}
              </span>
            ) : (
              t("none")
            )
          }
          hint={
            model.bestAsk
              ? t("workstation.tokensHint", { qty: formatInteger(model.bestAsk.quantity, locale) })
              : t("workstation.noAsks")
          }
        />
        <Metric
          label={t("workstation.openInterest")}
          value={t("none")}
          hint={t("workstation.openInterestHint")}
        />
        <Metric
          label={t("workstation.lastUpdated")}
          value={asOf ? formatUtcTime(asOf) : t("none")}
          hint={asOf ? `${formatUtcDate(asOf, locale)} UTC` : undefined}
        />
      </div>

      <ContextTabs
        ariaLabel={t("workstation.localNav")}
        moreLabel={t("workstation.moreTabs")}
        items={tabItems}
        className="mb-2"
        trailing={
          <MarketToolbar
            watchLabel={t("workstation.watch")}
            actionsLabel={t("workstation.marketActions")}
            overviewLabel={t("workstation.openInstrument")}
            classicLabel={t("workstation.classicMarket")}
            overviewHref={model.instrumentHref}
            classicHref={model.classicHref}
          />
        }
      />

      {tab === "market" ? <MarketGrid model={model} locale={locale} reviewMode={reviewMode} /> : null}
      {tab === "order-book" || tab === "depth" ? (
        <WorkstationPanel title={t("workstation.orderBook")} className="min-h-[420px]" padded={false}>
          <OrderBookBlock model={model} locale={locale} />
        </WorkstationPanel>
      ) : null}
      {tab === "trades" ? <TradesPanel model={model} locale={locale} /> : null}
      {tab === "positions" ? <PositionsPanel model={model} locale={locale} /> : null}
      {tab === "orders" ? (
        <OrdersPanel model={model} locale={locale} reviewMode={reviewMode} operator />
      ) : null}
      {tab === "market-data" ? <MarketDataPanel model={model} locale={locale} /> : null}
      {tab === "information" ? <InformationPanel model={model} /> : null}
      {tab === "contracts" ? <ContractDetails model={model} /> : null}
      {tab === "audit" ? <AuditPanel model={model} locale={locale} /> : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-[#7B857F]">
        <p>
          {t("workstation.footerTimes")}
          {asOf
            ? ` · ${t("workstation.dataAsOf", { value: `${formatUtcDate(asOf, locale)} ${formatUtcTime(asOf)} UTC` })}`
            : null}
        </p>
        <p>{t("workstation.footerDisclaimer")}</p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[10px] tracking-[0.08em] text-[#7B857F] uppercase">{label}</p>
      <p className="mt-1 text-[1.125rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

async function MarketGrid({
  model,
  locale,
  reviewMode,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
  reviewMode: boolean;
}) {
  const t = await getTranslations("institutional");
  return (
    <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,2.45fr)_minmax(0,1.15fr)]">
      <div className="flex min-h-0 flex-col gap-2">
        <WorkstationPanel title={t("workstation.orderBook")} className="min-h-[248px]" padded={false}>
          <OrderBookBlock model={model} locale={locale} />
        </WorkstationPanel>
        <WorkstationPanel title={t("workstation.recentTrades")} padded={false}>
          <TradesTable model={model} locale={locale} compact />
        </WorkstationPanel>
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        <WorkstationPanel
          title={t("workstation.priceChart")}
          className="min-h-[188px]"
          action={<ChartChrome />}
          padded={false}
        >
          <PriceChart
            lastPrice={
              model.lastPrice !== null
                ? formatPrice(model.lastPrice, locale, model.instrument.decimals)
                : null
            }
            empty={t("workstation.noPriceHistory")}
          />
        </WorkstationPanel>
        <MarketDataStrip locale={locale} />
        <PositionsPanel model={model} locale={locale} compact />
        <OrdersPanel model={model} locale={locale} reviewMode={reviewMode} compact />
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        <WorkstationPanel title={t("workstation.placeOrder")}>
          <PlaceOrder
            marketId={model.market.id}
            canSubmit={model.canSubmit}
            reviewMode={reviewMode}
            lastPrice={model.lastPrice}
            availableQty={model.holding?.available ?? 0}
            availableCash={model.cash?.available ?? 0}
            locale={locale}
            labels={{
              buy: t("workstation.buy"),
              sell: t("workstation.sell"),
              limitOrder: t("workstation.limitOrder"),
              price: t("workstation.price"),
              size: t("workstation.size"),
              tokens: t("workstation.tokens"),
              max: t("workstation.max"),
              orderValue: t("workstation.orderValue"),
              timeInForce: t("workstation.timeInForce"),
              untilFilled: t("workstation.untilFilled"),
              placeBuy: t("workstation.placeBuy"),
              placeSell: t("workstation.placeSell"),
              available: t("workstation.available"),
              viewOnly: t("workstation.viewOnly"),
              noMonetaryValue: t("workstation.noMonetaryValue"),
            }}
          />
        </WorkstationPanel>
        <ContractDetails model={model} compact />
        <MarketStatus model={model} />
      </div>
    </div>
  );
}

async function OrderBookBlock({
  model,
  locale,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
}) {
  const t = await getTranslations("institutional");
  if (!model.bookAvailable) {
    return (
      <div className="p-3">
        <EmptyState>{t("bookUnavailable")}</EmptyState>
      </div>
    );
  }
  return (
    <OrderBook
      bids={model.bids}
      asks={model.asks}
      locale={locale}
      emptyAsks={t("workstation.noAsks")}
      emptyBids={t("workstation.noBids")}
      spreadLabel={t("workstation.spread")}
      askLabel={t("workstation.ask")}
      bidLabel={t("workstation.bid")}
      priceLabel={t("workstation.price")}
      sizeLabel={t("workstation.size")}
      totalLabel={t("workstation.total")}
    />
  );
}

function ChartChrome() {
  return (
    <div className="flex items-center gap-0.5">
      {CHART_RANGES.map((range, index) => (
        <span
          key={range}
          className={cn(
            "inline-flex h-6 items-center rounded px-1.5 text-[10px] tracking-wide",
            index === 0 ? "bg-[#EAF4EE] font-medium text-[#0B5D3B]" : "text-[#7B857F]",
          )}
        >
          {range}
        </span>
      ))}
    </div>
  );
}

function PriceChart({ lastPrice, empty }: { lastPrice: string | null; empty: string }) {
  return (
    <div className="relative flex h-[168px] flex-col justify-end">
      <svg viewBox="0 0 640 168" className="absolute inset-0 size-full" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <line
            key={row}
            x1="0"
            x2="640"
            y1={10 + row * 26}
            y2={10 + row * 26}
            stroke="#E8EEE9"
            strokeWidth="1"
          />
        ))}
        {lastPrice !== null ? (
          <line x1="0" x2="600" y1="84" y2="84" stroke="#0B5D3B" strokeDasharray="4 4" strokeWidth="1.25" />
        ) : null}
      </svg>
      <p className="relative z-10 px-4 pb-8 text-center text-[12px] text-muted-foreground">{empty}</p>
      {lastPrice !== null ? (
        <span className="absolute top-[72px] right-2 z-10 rounded-sm bg-[#0B5D3B] px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
          {lastPrice}
        </span>
      ) : null}
    </div>
  );
}

async function MarketDataStrip({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("institutional");
  void locale;
  const cells = [
    t("workstation.open"),
    t("workstation.high"),
    t("workstation.low"),
    t("workstation.closePrev"),
    t("workstation.vwap"),
  ];
  return (
    <div className="grid grid-cols-5 overflow-hidden rounded-md border border-border">
      {cells.map((label) => (
        <div key={label} className="border-r border-border px-2 py-1.5 last:border-r-0">
          <p className="text-[10px] tracking-[0.06em] text-[#7B857F] uppercase">{label}</p>
          <p className="mt-1 text-[13px] font-medium tabular-nums">{t("none")}</p>
        </div>
      ))}
    </div>
  );
}

async function MarketDataPanel({
  model,
  locale,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
}) {
  const t = await getTranslations("institutional");
  return (
    <WorkstationPanel title={t("workstation.marketData")}>
      <p className="mb-3 text-sm text-muted-foreground">{t("workstation.noOhlc")}</p>
      <FactList
        columns={2}
        items={[
          {
            label: t("workstation.lastPrice"),
            value: model.lastPrice !== null ? formatDemoKzt(model.lastPrice, locale) : t("none"),
          },
          {
            label: t("matchedVolume"),
            value:
              model.matchedNotional !== null
                ? formatDemoKzt(model.matchedNotional, locale)
                : t("notAvailable"),
          },
        ]}
      />
      <div className="mt-3">
        <MarketDataStrip locale={locale} />
      </div>
    </WorkstationPanel>
  );
}

async function TradesPanel({
  model,
  locale,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
}) {
  const t = await getTranslations("institutional");
  return (
    <WorkstationPanel title={t("workstation.recentTrades")} padded={false}>
      <TradesTable model={model} locale={locale} />
    </WorkstationPanel>
  );
}

async function TradesTable({
  model,
  locale,
  compact,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
  compact?: boolean;
}) {
  const t = await getTranslations("institutional");
  if (model.trades.length === 0) {
    return (
      <div className="p-3">
        <EmptyState>{t("noTrades")}</EmptyState>
      </div>
    );
  }
  return (
    <Table className="text-[12px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-7 px-2">{t("workstation.time")}</TableHead>
          <TableHead className="h-7 px-2">{t("workstation.price")}</TableHead>
          <TableHead className="h-7 px-2 text-right">{t("workstation.size")}</TableHead>
          <TableHead className="h-7 px-2 text-right">{t("workstation.value")}</TableHead>
          <TableHead className="h-7 px-2">{t("workstation.side")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {model.trades.map((trade) => (
          <TableRow key={trade.id}>
            <TableCell className="px-2 py-1.5 tabular-nums text-[11px]">
              {formatUtcTime(trade.createdAt)}
            </TableCell>
            <TableCell className="px-2 py-1.5 tabular-nums">
              {formatInteger(trade.price, locale)}
            </TableCell>
            <TableCell className="px-2 py-1.5 text-right tabular-nums">
              {formatInteger(trade.quantity, locale)}
            </TableCell>
            <TableCell className="px-2 py-1.5 text-right tabular-nums">
              {formatInteger(trade.notional, locale)}
            </TableCell>
            <TableCell className="px-2 py-1.5">
              {trade.aggressor ? (
                <span
                  className={
                    trade.aggressor === "BUY"
                      ? "text-[11px] font-medium text-[#0B5D3B]"
                      : "text-[11px] font-medium text-red-700"
                  }
                >
                  {trade.aggressor === "BUY" ? t("workstation.buy") : t("workstation.sell")}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">{t("workstation.matched")}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function PositionsPanel({
  model,
  locale,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
  compact?: boolean;
}) {
  const t = await getTranslations("institutional");
  return (
    <WorkstationPanel title={t("workstation.myPositions")} padded={false}>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="h-7 px-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t("workstation.instrument")}
            </th>
            <th className="h-7 px-2 text-right text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t("workstation.position")}
            </th>
            <th className="h-7 px-2 text-right text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t("workstation.avgPrice")}
            </th>
            <th className="h-7 px-2 text-right text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t("workstation.pnl")}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.holding && model.participantId ? (
            <tr className="border-b border-border">
              <td className="px-2 py-1.5 font-medium">{model.instrument.symbol}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatInteger(model.holding.buckets.owned, locale)}
              </td>
              <td className="px-2 py-1.5 text-right text-muted-foreground">{t("none")}</td>
              <td className="px-2 py-1.5 text-right text-muted-foreground">{t("none")}</td>
            </tr>
          ) : (
            <tr>
              <td colSpan={4} className="px-2 py-2 text-[12px] text-muted-foreground">
                {t("workstation.noParticipant")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {model.holding && (model.holding.buckets.pendingIn > 0 || model.holding.buckets.pendingOut > 0) ? (
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {t("workstation.pendingNote", {
            pendingIn: formatInteger(model.holding.buckets.pendingIn, locale),
            pendingOut: formatInteger(model.holding.buckets.pendingOut, locale),
          })}
        </p>
      ) : null}
    </WorkstationPanel>
  );
}

async function OrdersPanel({
  model,
  locale,
  reviewMode,
  compact,
  operator,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
  reviewMode: boolean;
  compact?: boolean;
  operator?: boolean;
}) {
  const t = await getTranslations("institutional");
  const rows = operator && model.seeAll ? model.myOrders : model.liveOrders;
  const title =
    operator && model.seeAll ? t("workstation.marketOrders") : t("workstation.myOrders");
  return (
    <WorkstationPanel
      title={title}
      padded={false}
      action={
        !reviewMode && model.canSubmit && model.liveOrders.length > 0 && !operator ? (
          <form action={cancelUiV2SecondaryOrderAction}>
            <input type="hidden" name="marketId" value={model.market.id} />
            <input type="hidden" name="cancelAll" value="1" />
            <button type="submit" className="text-[11px] font-medium text-red-700 hover:underline">
              {t("workstation.cancelAll")}
            </button>
          </form>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="h-7 px-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("workstation.side")}
              </th>
              <th className="h-7 px-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("workstation.type")}
              </th>
              <th className="h-7 px-2 text-right text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("workstation.price")}
              </th>
              <th className="h-7 px-2 text-right text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("workstation.size")}
              </th>
              <th className="h-7 px-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("workstation.status")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-2 py-2 text-[12px] text-muted-foreground">
                {model.participantId || (operator && model.seeAll)
                  ? t("workstation.noOrders")
                  : t("workstation.noParticipant")}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <Table className="text-[12px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 px-2">{t("workstation.side")}</TableHead>
              <TableHead className="h-7 px-2">{t("workstation.type")}</TableHead>
              <TableHead className="h-7 px-2 text-right">{t("workstation.price")}</TableHead>
              <TableHead className="h-7 px-2 text-right">{t("workstation.size")}</TableHead>
              <TableHead className="h-7 px-2">{t("workstation.status")}</TableHead>
              {compact || reviewMode ? null : <TableHead className="h-7 px-2" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((order) => (
              <TableRow key={order.id}>
                <TableCell
                  className={cn(
                    "px-2 py-1.5 text-[11px] font-medium",
                    order.side === "BUY" ? "text-[#0B5D3B]" : "text-red-700",
                  )}
                >
                  {order.side === "BUY" ? t("workstation.buy") : t("workstation.sell")}
                </TableCell>
                <TableCell className="px-2 py-1.5">{t("workstation.limitOrder")}</TableCell>
                <TableCell className="px-2 py-1.5 text-right tabular-nums">
                  {formatInteger(order.price, locale)}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right tabular-nums">
                  {formatInteger(order.remainingQuantity, locale)}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <StatusChip
                    family="order"
                    code={order.status}
                    label={lookupMessage(t, `workstation.orderStatus.${order.status}`)}
                  />
                </TableCell>
                {compact || reviewMode || !model.canSubmit || order.participantId !== model.participantId ? null : (
                  <TableCell className="px-2 py-1.5">
                    {order.status === "OPEN" || order.status === "PARTIALLY_FILLED" ? (
                      <form action={cancelUiV2SecondaryOrderAction}>
                        <input type="hidden" name="marketId" value={model.market.id} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <button type="submit" className="text-[11px] text-red-700 hover:underline">
                          {t("workstation.cancel")}
                        </button>
                      </form>
                    ) : null}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </WorkstationPanel>
  );
}

async function ContractDetails({
  model,
  compact,
}: {
  model: MarketWorkstationModel;
  compact?: boolean;
}) {
  const t = await getTranslations("institutional");
  return (
    <WorkstationPanel title={t("workstation.contractDetails")}>
      <FactList
        items={[
          {
            label: t("workstation.tokenUnit"),
            value:
              model.unitTonnes !== null
                ? t("workstation.tokenUnitValue", { tonnes: model.unitTonnes })
                : (model.instrument.denomination ?? t("notAvailable")),
          },
          {
            label: t("workstation.lotSize"),
            value: t("workstation.lotSizeValue"),
          },
          {
            label: t("workstation.tickSize"),
            value: t("workstation.tickSizeValue"),
          },
          {
            label: t("workstation.minOrder"),
            value: t("workstation.minOrderValue"),
          },
        ]}
      />
    </WorkstationPanel>
  );
}

async function MarketStatus({ model }: { model: MarketWorkstationModel }) {
  const t = await getTranslations("institutional");
  const open =
    model.market.demonstratorStatus === "DEMO_OPEN" &&
    model.market.transacting &&
    model.market.matchingEnabled;
  return (
    <WorkstationPanel title={t("workstation.marketStatus")}>
      <FactList
        items={[
          {
            label: t("workstation.market"),
            value: (
              <StatusChip
                family="market"
                code={open ? "OPEN" : model.market.demonstratorStatus}
                label={open ? t("statusOpen") : t("statusClosed")}
              />
            ),
          },
          {
            label: t("workstation.session"),
            value: model.market.matchingEnabled
              ? t("workstation.matchingActive")
              : t("workstation.matchingOff"),
          },
          {
            label: t("workstation.nextSettlement"),
            value: model.market.settlementEnabled
              ? t("settlementOn")
              : t("workstation.settlementPending"),
          },
        ]}
      />
    </WorkstationPanel>
  );
}

async function InformationPanel({ model }: { model: MarketWorkstationModel }) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  return (
    <WorkstationPanel title={t("workstation.information")}>
      <FactList
        columns={2}
        items={[
          { label: t("workstation.market"), value: model.market.id, mono: true },
          { label: t("workstation.instrument"), value: model.instrument.symbol },
          {
            label: t("protocol"),
            value: model.protocol?.name ?? model.instrument.assetProtocolId,
          },
          {
            label: t("assetClass"),
            value: lookupMessage(tCore, ASSET_CLASS_KEYS[model.instrument.assetClass]),
          },
          { label: t("issuer"), value: model.instrument.issuerName },
          { label: t("unitOfAccount"), value: model.market.settlementAssetLabel },
          {
            label: t("workstation.orderTypes"),
            value: model.market.allowedOrderTypes.join(", "),
          },
          {
            label: t("settlementNote"),
            value: model.market.settlementEnabled ? t("settlementOn") : t("settlementOff"),
          },
        ]}
      />
      <p className="mt-3 text-[12px] text-muted-foreground">{t("matchedNotSettled")}</p>
    </WorkstationPanel>
  );
}

async function AuditPanel({
  model,
  locale,
}: {
  model: MarketWorkstationModel;
  locale: AppLocale;
}) {
  const t = await getTranslations("institutional");
  if (model.events.length === 0) {
    return (
      <WorkstationPanel title={t("workstation.auditTrail")}>
        <EmptyState>{t("noActivity")}</EmptyState>
      </WorkstationPanel>
    );
  }
  return (
    <WorkstationPanel title={t("workstation.auditTrail")} padded={false}>
      <Table className="text-[12px]">
        <TableHeader>
          <TableRow>
            <TableHead className="h-7 px-2">{t("workstation.time")}</TableHead>
            <TableHead className="h-7 px-2">{t("workstation.event")}</TableHead>
            <TableHead className="h-7 px-2">{t("workstation.entity")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...model.events].reverse().map((event) => (
            <TableRow key={event.id}>
              <TableCell className="px-2 py-1.5 text-[11px] tabular-nums">
                {formatUtcDate(event.timestamp, locale)} {formatUtcTime(event.timestamp)}
              </TableCell>
              <TableCell className="px-2 py-1.5">
                {lookupMessage(t, `marketEvent.${event.type}`)}
              </TableCell>
              <TableCell className="px-2 py-1.5 font-mono text-[11px]">{event.entityId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </WorkstationPanel>
  );
}
