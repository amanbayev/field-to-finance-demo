import {
  actorCan,
  type ActorContext,
} from "@/domain/identity";
import {
  availableBalance,
  bidsFromOrders,
  asksFromOrders,
  actorMaySubmitOrder,
  canReceive,
  canTrade,
  eligibilityFor,
  GRAIN_DESK_ID,
  participantIdForActor,
  STEPPE_CAPITAL_ID,
  WHEAT_DEMO_MARKET_ID,
  type EngineState,
  type Holding,
  type Market,
  type MarketInstrument,
  type OrderSide,
  type ParticipantInstrumentEligibility,
} from "@/domain/market-core";
import { DEMO_MEMBERSHIPS, DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import {
  eligibilityAssessments,
  marketInstruments,
  marketParticipants,
} from "@/data/market-core/catalog";
import { getMarketInstrument } from "@/services/market-core-service";
import {
  fetchPersistentEngineState,
  rpcCancelOrder,
  rpcSubmitLimitOrder,
} from "@/services/secondary-market-repository";

export { participantIdForActor };

export function actorMaySubmitSecondaryOrder(
  actor: ActorContext,
  instrument: MarketInstrument,
  market: Market,
  eligibility: readonly ParticipantInstrumentEligibility[],
): boolean {
  return actorMaySubmitOrder({
    actor,
    instrument,
    market,
    eligibility,
    assessments: eligibilityAssessments,
    participants: marketParticipants,
    organizations: DEMO_ORGANIZATIONS,
    memberships: DEMO_MEMBERSHIPS,
    instruments: marketInstruments,
  });
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
    canSubmit: actorMaySubmitSecondaryOrder(actor, instrument, market, state.eligibility),
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

/**
 * TypeScript predicate = fail-closed UX/server precheck.
 * RPC = final atomic authorization.
 *
 * Current eligibility is taken from the existing snapshot/current-state
 * boundary. This precheck does not authorize a persistent write.
 */
export async function submitSecondaryOrder(input: {
  actor: ActorContext;
  side: OrderSide;
  price: number;
  quantity: number;
  idempotencyKey: string;
}) {
  const state = await fetchPersistentEngineState();
  const market =
    state.markets.find((item) => item.id === WHEAT_DEMO_MARKET_ID) ?? state.markets[0];
  const instrument = market
    ? state.instruments.find((item) => item.id === market.instrumentId)
    : undefined;
  if (
    !market ||
    !instrument ||
    !actorMaySubmitSecondaryOrder(input.actor, instrument, market, state.eligibility)
  ) {
    return { error: "INELIGIBLE" as const, state };
  }
  const submitted = await rpcSubmitLimitOrder({
    side: input.side,
    price: input.price,
    quantity: input.quantity,
    idempotencyKey: input.idempotencyKey,
    marketId: WHEAT_DEMO_MARKET_ID,
  });
  const latest = await fetchPersistentEngineState();
  if (!submitted.ok) {
    return { error: submitted.error ?? "INELIGIBLE", state: latest };
  }
  return { error: null, state: latest };
}

export async function cancelSecondaryOrder(input: {
  actor: ActorContext;
  orderId: string;
  idempotencyKey: string;
}) {
  const state = await fetchPersistentEngineState();
  const market =
    state.markets.find((item) => item.id === WHEAT_DEMO_MARKET_ID) ?? state.markets[0];
  const instrument = market
    ? state.instruments.find((item) => item.id === market.instrumentId)
    : undefined;
  if (
    !market ||
    !instrument ||
    !actorMaySubmitSecondaryOrder(input.actor, instrument, market, state.eligibility)
  ) {
    return { error: "NOT_OWNER" as const, state };
  }
  const cancelled = await rpcCancelOrder({
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
  });
  const latest = await fetchPersistentEngineState();
  if (!cancelled.ok) {
    return { error: cancelled.error ?? "NOT_OWNER", state: latest };
  }
  return { error: null, state: latest };
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
