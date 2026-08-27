import type { ActorContext } from "@/domain/identity";
import {
  asksFromOrders,
  bidsFromOrders,
  canTrade,
  eligibilityFor,
  isLiveOrder,
  type AssetProtocol,
  type EngineState,
  type Holding,
  type InstrumentEligibilityState,
  type Market,
  type MarketEvent,
  type MarketInstrument,
  type Order,
  type OrderSide,
  type SettlementAccount,
  type Trade,
} from "@/domain/market-core";
import type { OrderBookLevel } from "@/domain/market-core/order-book";
import {
  getInstrumentMarketContext,
  getMarket,
} from "@/services/market-core-service";
import { fetchPersistentEngineState } from "@/services/secondary-market-repository";
import {
  canSubmitOrders,
  canViewAllMarketActivity,
  participantIdForActor,
} from "@/services/secondary-market-service";
import { getTokenBySymbol } from "@/services/token-service";

export interface TapeTrade {
  id: string;
  createdAt: string;
  price: number;
  quantity: number;
  notional: number;
  aggressor: OrderSide | null;
  status: Trade["status"];
}

export interface MarketWorkstationModel {
  market: Market;
  instrument: MarketInstrument;
  protocol: AssetProtocol | null;
  wheat: boolean;
  cropQuality: string | null;
  unitTonnes: number | null;
  lastTrade: Trade | null;
  lastPrice: number | null;
  matchedQuantity: number | null;
  matchedNotional: number | null;
  bestBid: OrderBookLevel | null;
  bestAsk: OrderBookLevel | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  trades: TapeTrade[];
  liveOrders: Order[];
  filledOrders: Order[];
  myOrders: Order[];
  events: MarketEvent[];
  holding: Holding | null;
  cash: SettlementAccount | null;
  eligibility: InstrumentEligibilityState;
  canSubmit: boolean;
  participantId: string | null;
  seeAll: boolean;
  bookAvailable: boolean;
  asOf: string | null;
  classicHref: string;
  instrumentHref: string;
}

export interface LoadMarketWorkstationOptions {
  engine?: EngineState | null;
  instrumentHref?: string;
}

function aggressorFor(trade: Trade, orders: readonly Order[]): OrderSide | null {
  const buy = orders.find((order) => order.id === trade.buyOrderId);
  const sell = orders.find((order) => order.id === trade.sellOrderId);
  if (!buy || !sell) {
    return null;
  }
  return buy.sequence > sell.sequence ? "BUY" : "SELL";
}

async function loadEngine() {
  try {
    return await fetchPersistentEngineState();
  } catch {
    return null;
  }
}

export async function loadMarketWorkstation(
  marketId: string,
  actor: ActorContext,
  options?: LoadMarketWorkstationOptions,
): Promise<MarketWorkstationModel | null> {
  const catalogMarket = getMarket(marketId);
  if (!catalogMarket) {
    return null;
  }
  const context = getInstrumentMarketContext(catalogMarket.instrumentId);
  if (!context) {
    return null;
  }

  const wheat = context.instrument.id === "WHEAT-2027";
  const engine = wheat
    ? options && "engine" in options
      ? (options.engine ?? null)
      : await loadEngine()
    : null;
  const market =
    engine?.markets.find((item) => item.id === marketId) ?? catalogMarket;
  const instrument =
    engine?.instruments.find((item) => item.id === market.instrumentId) ??
    context.instrument;
  const protocol = context.protocol;
  const tokenDetail = wheat ? getTokenBySymbol(instrument.symbol) : null;
  const participantId = participantIdForActor(actor);
  const eligibility: InstrumentEligibilityState = participantId
    ? eligibilityFor(engine?.eligibility ?? [], participantId, instrument.id)
    : "NOT_ASSESSED";
  const holding = participantId
    ? (engine?.holdings.find(
        (row) =>
          row.holderReference === participantId && row.instrumentId === instrument.id,
      ) ?? null)
    : null;
  const cash = participantId
    ? (engine?.settlementAccounts.find((row) => row.participantId === participantId) ??
      null)
    : null;
  const seeAll = canViewAllMarketActivity(actor);
  const marketOrders = engine
    ? engine.orders.filter((order) => order.marketId === market.id)
    : [];
  const secondaryTrades = engine
    ? engine.trades.filter(
        (trade) => trade.kind === "SECONDARY" && trade.marketId === market.id,
      )
    : [];
  const bids = engine ? bidsFromOrders(marketOrders) : [];
  const asks = engine ? asksFromOrders(marketOrders) : [];
  const lastTrade = secondaryTrades.at(-1) ?? null;
  const myOrders = engine
    ? seeAll
      ? marketOrders
      : marketOrders.filter((order) => order.participantId === participantId)
    : [];
  const liveOrders = myOrders.filter((order) => isLiveOrder(order));
  const filledOrders = myOrders.filter((order) => order.status === "FILLED");
  const canSubmit =
    Boolean(engine) &&
    canSubmitOrders(actor) &&
    Boolean(participantId) &&
    canTrade({ eligibility, instrument, market });

  return {
    market,
    instrument,
    protocol,
    wheat,
    cropQuality: tokenDetail
      ? `${tokenDetail.token.terms.crop} ${tokenDetail.token.terms.quality}`
      : null,
    unitTonnes: tokenDetail?.token.terms.unitTonnesPerToken ?? null,
    lastTrade,
    lastPrice: lastTrade?.price ?? null,
    matchedQuantity:
      engine && secondaryTrades.length > 0
        ? secondaryTrades.reduce((sum, trade) => sum + trade.quantity, 0)
        : engine
          ? 0
          : null,
    matchedNotional:
      engine && secondaryTrades.length > 0
        ? secondaryTrades.reduce((sum, trade) => sum + trade.notional, 0)
        : engine
          ? 0
          : null,
    bestBid: bids[0] ?? null,
    bestAsk: asks[0] ?? null,
    bids,
    asks,
    trades: [...secondaryTrades].reverse().map((trade) => ({
      id: trade.id,
      createdAt: trade.createdAt,
      price: trade.price,
      quantity: trade.quantity,
      notional: trade.notional,
      aggressor: aggressorFor(trade, marketOrders),
      status: trade.status,
    })),
    liveOrders,
    filledOrders,
    myOrders,
    events: engine?.events.filter((event) => event.marketId === market.id) ?? [],
    holding,
    cash,
    eligibility,
    canSubmit,
    participantId,
    seeAll,
    bookAvailable: Boolean(engine),
    asOf: lastTrade?.createdAt ?? engine?.now ?? null,
    classicHref: "/secondary",
    instrumentHref:
      options?.instrumentHref ?? `/ui-v2/instruments/${instrument.id}`,
  };
}
