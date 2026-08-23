import {
  actorCan,
  type ActorContext,
} from "@/domain/identity";
import {
  availableBalance,
  bidsFromOrders,
  asksFromOrders,
  canReceive,
  canTrade,
  eligibilityFor,
  GRAIN_DESK_ID,
  participantIdFromInvestorRef,
  STEPPE_CAPITAL_ID,
  WHEAT_DEMO_MARKET_ID,
  type EngineState,
  type Holding,
  type OrderSide,
} from "@/domain/market-core";
import { getMarketInstrument } from "@/services/market-core-service";
import {
  fetchPersistentEngineState,
  rpcCancelOrder,
  rpcSubmitLimitOrder,
} from "@/services/secondary-market-repository";

export function participantIdForActor(actor: ActorContext): string | null {
  return participantIdFromInvestorRef(
    actor.effective.investorReference,
    actor.effective.organization?.slug,
  );
}

export function canSubmitOrders(actor: ActorContext): boolean {
  return actorCan(actor, "market.trade") && Boolean(participantIdForActor(actor));
}

export function canViewAllMarketActivity(actor: ActorContext): boolean {
  return (
    actorCan(actor, "regulator.read") ||
    (actorCan(actor, "issuance.manage") && actorCan(actor, "audit.read"))
  );
}

export async function getSecondaryEngineState(): Promise<EngineState> {
  return fetchPersistentEngineState();
}

export async function getSecondaryMarketView(actor: ActorContext) {
  const state = await fetchPersistentEngineState();
  const market =
    state.markets.find((item) => item.id === WHEAT_DEMO_MARKET_ID) ?? state.markets[0]!;
  const instrument = state.instruments.find((item) => item.id === market.instrumentId)!;
  const participantId = participantIdForActor(actor);
  const eligibility = participantId
    ? eligibilityFor(state.eligibility, participantId, instrument.id)
    : "NOT_ASSESSED";
  const holding = participantId
    ? state.holdings.find(
        (row) => row.holderReference === participantId && row.instrumentId === instrument.id,
      )
    : undefined;
  const cash = participantId
    ? state.settlementAccounts.find((row) => row.participantId === participantId)
    : undefined;
  const seeAll = canViewAllMarketActivity(actor);
  const myOrders = seeAll
    ? state.orders
    : state.orders.filter((order) => order.participantId === participantId);
  return {
    state,
    market,
    instrument,
    participantId,
    eligibility,
    canTrade: participantId
      ? canTrade({ eligibility, instrument, market })
      : false,
    canReceive: participantId
      ? canReceive({ eligibility, instrument })
      : false,
    canSubmit: canSubmitOrders(actor) && participantId
      ? canTrade({ eligibility, instrument, market })
      : false,
    holding,
    cash,
    bids: bidsFromOrders(state.orders.filter((order) => order.marketId === market.id)),
    asks: asksFromOrders(state.orders.filter((order) => order.marketId === market.id)),
    myOrders,
    trades: state.trades.filter((trade) => trade.kind === "SECONDARY"),
    events: state.events,
    seeAll,
  };
}

export async function submitSecondaryOrder(input: {
  actor: ActorContext;
  side: OrderSide;
  price: number;
  quantity: number;
  idempotencyKey: string;
}) {
  if (!canSubmitOrders(input.actor)) {
    return { error: "INELIGIBLE" as const, state: await fetchPersistentEngineState() };
  }
  if (!participantIdForActor(input.actor)) {
    return { error: "INELIGIBLE" as const, state: await fetchPersistentEngineState() };
  }
  const submitted = await rpcSubmitLimitOrder({
    side: input.side,
    price: input.price,
    quantity: input.quantity,
    idempotencyKey: input.idempotencyKey,
    marketId: WHEAT_DEMO_MARKET_ID,
  });
  const state = await fetchPersistentEngineState();
  if (!submitted.ok) {
    return { error: submitted.error ?? "INELIGIBLE", state };
  }
  return { error: null, state };
}

export async function cancelSecondaryOrder(input: {
  actor: ActorContext;
  orderId: string;
  idempotencyKey: string;
}) {
  if (!canSubmitOrders(input.actor) || !participantIdForActor(input.actor)) {
    return { error: "NOT_OWNER" as const, state: await fetchPersistentEngineState() };
  }
  const cancelled = await rpcCancelOrder({
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
  });
  const state = await fetchPersistentEngineState();
  if (!cancelled.ok) {
    return { error: cancelled.error ?? "NOT_OWNER", state };
  }
  return { error: null, state };
}

export function overlayWorkingHoldings(
  legal: readonly Holding[],
  state: EngineState,
): Holding[] {
  return legal.map((holding) => {
    const working = state.holdings.find(
      (row) =>
        row.holderReference === holding.holderReference &&
        row.instrumentId === holding.instrumentId,
    );
    if (!working) {
      return holding;
    }
    const buckets = {
      ...holding.buckets,
      owned: working.buckets.owned,
      reservedForOrders: working.buckets.reservedForOrders,
      pendingIn: working.buckets.pendingIn,
      pendingOut: working.buckets.pendingOut,
      pledged: working.buckets.pledged,
      blocked: working.buckets.blocked,
    };
    return { ...holding, buckets, available: availableBalance(buckets) };
  });
}

export function secondarySurveillance(state: EngineState) {
  const openOrders = state.orders.filter(
    (order) => order.status === "OPEN" || order.status === "PARTIALLY_FILLED",
  );
  const matchedTrades = state.trades.filter((trade) => trade.kind === "SECONDARY");
  const pendingSettlements = state.settlements.filter(
    (item) => item.kind === "SECONDARY" && item.status !== "FINAL" && item.status !== "DVP_COMPLETE",
  );
  const rejected = state.orders.filter((order) => order.status === "REJECTED");
  const eligibilityRejects = rejected.filter((order) => order.rejectReason === "INELIGIBLE");
  return {
    openOrders,
    matchedTrades,
    pendingSettlements,
    failedSettlements: [] as const,
    rejected,
    eligibilityRejects,
    steppe: state.holdings.find((row) => row.holderReference === STEPPE_CAPITAL_ID),
    grainDesk: state.holdings.find((row) => row.holderReference === GRAIN_DESK_ID),
  };
}

export function instrumentName(instrumentId: string): string {
  return getMarketInstrument(instrumentId)?.symbol ?? instrumentId;
}

export function noDevnetSettlementInPhase5B(): true {
  return true;
}
