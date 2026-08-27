import { cn } from "@/lib/utils";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import type { OrderBookLevel } from "@/domain/market-core/order-book";

function BookRow({
  level,
  side,
  maxQty,
  locale,
}: {
  level: OrderBookLevel;
  side: "bid" | "ask";
  maxQty: number;
  locale: AppLocale;
}) {
  const width = maxQty > 0 ? Math.max(8, (level.quantity / maxQty) * 100) : 0;
  const bid = side === "bid";
  return (
    <div className="relative grid h-[22px] grid-cols-[1fr_56px_1fr] items-center px-2 text-[11px] tabular-nums">
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0",
          bid ? "bg-[#EAF4EE]" : "bg-red-50",
        )}
        style={{ width: `${width}%` }}
      />
      <span className={cn("relative z-10 font-medium", bid ? "text-[#0B5D3B]" : "text-red-700")}>
        {formatInteger(level.price, locale)}
      </span>
      <span className="relative z-10 text-right text-foreground">{formatInteger(level.quantity, locale)}</span>
      <span className="relative z-10 text-right text-[#59645D]">{formatInteger(level.total, locale)}</span>
    </div>
  );
}

export function OrderBook({
  bids,
  asks,
  locale,
  emptyAsks,
  emptyBids,
  spreadLabel,
  askLabel,
  bidLabel,
  priceLabel,
  sizeLabel,
  totalLabel,
}: {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  locale: AppLocale;
  emptyAsks: string;
  emptyBids: string;
  spreadLabel: string;
  askLabel: string;
  bidLabel: string;
  priceLabel: string;
  sizeLabel: string;
  totalLabel: string;
}) {
  const displayAsks = [...asks].slice(0, 8).reverse();
  const displayBids = bids.slice(0, 8);
  const maxQty = Math.max(1, ...asks.map((level) => level.quantity), ...bids.map((level) => level.quantity));
  const bestAsk = asks[0] ?? null;
  const bestBid = bids[0] ?? null;
  const spread =
    bestAsk && bestBid ? bestAsk.price - bestBid.price : null;
  const spreadPct =
    spread !== null && bestBid ? (spread / bestBid.price) * 100 : null;

  return (
    <div className="flex h-full min-h-[220px] flex-col text-[11px]">
      <div className="grid grid-cols-[1fr_56px_1fr] border-b border-border px-2 py-1 text-[10px] tracking-[0.06em] text-[#7B857F] uppercase">
        <span>{priceLabel}</span>
        <span className="text-right">{sizeLabel}</span>
        <span className="text-right">{totalLabel}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-[72px] flex-1 flex-col justify-end">
          {displayAsks.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{emptyAsks}</p>
          ) : (
            displayAsks.map((level) => (
              <BookRow
                key={`ask-${level.price}`}
                level={level}
                side="ask"
                maxQty={maxQty}
                locale={locale}
              />
            ))
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-y border-border bg-[#F7F9F7] px-2 py-1.5">
          <div className="min-w-0">
            <p className="text-[9px] tracking-[0.08em] text-[#7B857F] uppercase">{askLabel}</p>
            <p className="truncate font-medium tabular-nums text-red-700">
              {bestAsk ? formatInteger(bestAsk.price, locale) : "—"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] tracking-[0.08em] text-[#7B857F] uppercase">{spreadLabel}</p>
            <p className="font-medium tabular-nums text-foreground">
              {spread !== null ? formatInteger(spread, locale) : "—"}
              {spreadPct !== null ? (
                <span className="ml-1 font-normal text-[#59645D]">
                  {spreadPct.toFixed(2)}%
                </span>
              ) : null}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[9px] tracking-[0.08em] text-[#7B857F] uppercase">{bidLabel}</p>
            <p className="truncate font-medium tabular-nums text-[#0B5D3B]">
              {bestBid ? formatInteger(bestBid.price, locale) : "—"}
            </p>
          </div>
        </div>
        <div className="flex min-h-[72px] flex-1 flex-col justify-start">
          {displayBids.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{emptyBids}</p>
          ) : (
            displayBids.map((level) => (
              <BookRow
                key={`bid-${level.price}`}
                level={level}
                side="bid"
                maxQty={maxQty}
                locale={locale}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
