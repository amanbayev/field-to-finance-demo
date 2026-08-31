import { canReceive, canTrade, eligibilityFor, withAvailable } from "./eligibility";
import {
  matchIncomingOrder,
  orderStatusAfterFill,
  RESTING_ORDER_EXECUTION_PRICE_RULE,
} from "./matching";
import {
  applyAssetRelease,
  applyAssetReserve,
  applyMatchedBuy,
  applyMatchedSell,
  hasAvailable,
} from "./reservation";
import { releaseSettlement, reserveSettlement } from "./settlement-provider";
import type {
  EngineState,
  Holding,
  MarketEvent,
  MarketEventType,
  Order,
  OrderSide,
  OrderSourceChannel,
  OrderType,
  Settlement,
  SettlementAccount,
  Trade,
} from "./types";

export { RESTING_ORDER_EXECUTION_PRICE_RULE };

export type EngineErrorCode =
  | "INELIGIBLE"
  | "INSUFFICIENT_AVAILABLE"
  | "INSUFFICIENT_SETTLEMENT"
  | "MARKET_CLOSED"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "UNSUPPORTED_ORDER_TYPE"
  | "PROTOCOL_INVESTMENT_NOT_TRADEABLE"
  | "INSTRUMENT_NOT_TRADEABLE"
  | "NOT_OWNER"
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_CANCELABLE"
  | "MARKET_NOT_FOUND";

export interface SubmitOrderCommand {
  marketId: string;
  participantId: string;
  actor: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  quantity: number;
  sourceChannel: OrderSourceChannel;
  now?: string;
}

export interface CancelOrderCommand {
  orderId: string;
  participantId: string;
  actor: string;
  now?: string;
}

export interface EngineResult {
  state: EngineState;
  order: Order | null;
  trades: Trade[];
  error: EngineErrorCode | null;
}

function cloneState(state: EngineState): EngineState {
  return structuredClone(state);
}

function stamp(state: EngineState, now?: string): string {
  return now ?? state.now;
}

function nextId(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

function pushEvent(
  state: EngineState,
  input: {
    actor: string;
    participantId: string | null;
    instrumentId: string;
    marketId: string;
    entityId: string;
    type: MarketEventType;
    metadata?: MarketEvent["metadata"];
    timestamp: string;
  },
): void {
  state.nextEventId += 1;
  state.events.push({
    id: nextId("EVT", state.nextEventId),
    timestamp: input.timestamp,
    actor: input.actor,
    participantId: input.participantId,
    instrumentId: input.instrumentId,
    marketId: input.marketId,
    entityId: input.entityId,
    type: input.type,
    metadata: input.metadata ?? {},
  });
}

function findHolding(
  state: EngineState,
  participantId: string,
  instrumentId: string,
): Holding | undefined {
  return state.holdings.find(
    (holding) =>
      holding.holderReference === participantId && holding.instrumentId === instrumentId,
  );
}

function replaceHolding(state: EngineState, holding: Holding): void {
  state.holdings = state.holdings.map((item) => (item.id === holding.id ? holding : item));
}

function findAccount(
  state: EngineState,
  participantId: string,
): SettlementAccount | undefined {
  return state.settlementAccounts.find((account) => account.participantId === participantId);
}

function replaceAccount(state: EngineState, account: SettlementAccount): void {
  state.settlementAccounts = state.settlementAccounts.map((item) =>
    item.participantId === account.participantId ? account : item,
  );
}

function replaceOrder(state: EngineState, order: Order): void {
  state.orders = state.orders.map((item) => (item.id === order.id ? order : item));
}

function ensureHolding(
  state: EngineState,
  participantId: string,
  participantName: string,
  instrumentId: string,
): Holding {
  const existing = findHolding(state, participantId, instrumentId);
  if (existing) {
    return existing;
  }
  const holding: Holding = {
    id: `hld-${participantId}-${instrumentId}`,
    instrumentId,
    holderReference: participantId,
    holderName: participantName,
    ...withAvailable({
      owned: 0,
      reservedForOrders: 0,
      pledged: 0,
      blocked: 0,
      pendingIn: 0,
      pendingOut: 0,
    }),
  };
  state.holdings.push(holding);
  return holding;
}

function reject(
  state: EngineState,
  command: SubmitOrderCommand,
  code: EngineErrorCode,
  instrumentId: string,
  timestamp: string,
): EngineResult {
  state.nextOrderId += 1;
  const order: Order = {
    id: nextId("ORD", state.nextOrderId),
    marketId: command.marketId,
    instrumentId,
    participantId: command.participantId,
    side: command.side,
    orderType: command.orderType,
    price: command.price,
    originalQuantity: command.quantity,
    remainingQuantity: 0,
    filledQuantity: 0,
    status: "REJECTED",
    sequence: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceChannel: command.sourceChannel,
    rejectReason: code,
  };
  state.orders.push(order);
  pushEvent(state, {
    actor: command.actor,
    participantId: command.participantId,
    instrumentId,
    marketId: command.marketId,
    entityId: order.id,
    type: "order_rejected",
    timestamp,
    metadata: { code },
  });
  return { state, order, trades: [], error: code };
}

function applyFillToOrder(order: Order, quantity: number, timestamp: string): Order {
  const filledQuantity = order.filledQuantity + quantity;
  const remainingQuantity = order.remainingQuantity - quantity;
  if (remainingQuantity < 0) {
    throw new Error("OVERFILL");
  }
  return {
    ...order,
    filledQuantity,
    remainingQuantity,
    status: orderStatusAfterFill(filledQuantity, remainingQuantity),
    updatedAt: timestamp,
  };
}

function advanceTradeClearing(
  state: EngineState,
  trade: Trade,
  timestamp: string,
): Trade {
  const instrument = state.instruments.find((item) => item.id === trade.instrumentId);
  if (!instrument) {
    return trade;
  }
  const buyerEligibility = eligibilityFor(
    state.eligibility,
    trade.buyerParticipantId,
    trade.instrumentId,
  );
  const sellerEligibility = eligibilityFor(
    state.eligibility,
    trade.sellerParticipantId,
    trade.instrumentId,
  );
  const buyerOk = canReceive({ eligibility: buyerEligibility, instrument });
  const sellerOk = sellerEligibility === "ELIGIBLE";
  const passed = buyerOk && sellerOk;
  pushEvent(state, {
    actor: "MATCHING_ENGINE",
    participantId: trade.buyerParticipantId,
    instrumentId: trade.instrumentId,
    marketId: trade.marketId,
    entityId: trade.id,
    type: "eligibility_rechecked",
    timestamp,
    metadata: { passed, buyerOk, sellerOk },
  });
  if (!passed) {
    return { ...trade, eligibilityRecheckPassed: false, status: "MATCHED" };
  }
  let next: Trade = {
    ...trade,
    eligibilityRecheckPassed: true,
    status: "CLEARING_READY",
    updatedAt: timestamp,
  };
  pushEvent(state, {
    actor: "MATCHING_ENGINE",
    participantId: null,
    instrumentId: trade.instrumentId,
    marketId: trade.marketId,
    entityId: trade.id,
    type: "clearing_started",
    timestamp,
    metadata: { status: "CLEARING_READY" },
  });
  next = {
    ...next,
    status: "AWAITING_DEVNET_SETTLEMENT",
    updatedAt: timestamp,
  };
  pushEvent(state, {
    actor: "MATCHING_ENGINE",
    participantId: trade.buyerParticipantId,
    instrumentId: trade.instrumentId,
    marketId: trade.marketId,
    entityId: trade.id,
    type: "settlement_reservation_confirmed",
    timestamp,
    metadata: { notional: trade.notional, dvp: "PENDING" },
  });
  return next;
}

export function recheckAndAdvanceClearing(
  current: EngineState,
  tradeId: string,
  timestamp?: string,
): EngineState {
  const state = structuredClone(current);
  const now = timestamp ?? state.now;
  state.trades = state.trades.map((trade) =>
    trade.id === tradeId ? advanceTradeClearing(state, { ...trade, status: "MATCHED" }, now) : trade,
  );
  return state;
}

export function createEngineState(
  input: Pick<
    EngineState,
    "markets" | "instruments" | "holdings" | "eligibility" | "settlementAccounts"
  > &
    Partial<EngineState>,
): EngineState {
  return {
    now: input.now ?? "2026-08-23T00:00:00.000Z",
    nextOrderSeq: input.nextOrderSeq ?? 0,
    nextOrderId: input.nextOrderId ?? 0,
    nextTradeId: input.nextTradeId ?? 0,
    nextReservationId: input.nextReservationId ?? 0,
    nextSettlementId: input.nextSettlementId ?? 0,
    nextEventId: input.nextEventId ?? 0,
    markets: input.markets,
    instruments: input.instruments,
    orders: input.orders ?? [],
    reservations: input.reservations ?? [],
    trades: input.trades ?? [],
    settlements: input.settlements ?? [],
    holdings: input.holdings,
    eligibility: input.eligibility,
    settlementAccounts: input.settlementAccounts,
    events: input.events ?? [],
  };
}

export function submitLimitOrder(
  current: EngineState,
  command: SubmitOrderCommand,
): EngineResult {
  const state = cloneState(current);
  const timestamp = stamp(state, command.now);
  state.now = timestamp;
  const market = state.markets.find((item) => item.id === command.marketId);
  if (!market) {
    return reject(state, command, "MARKET_NOT_FOUND", command.marketId, timestamp);
  }
  const instrument = state.instruments.find((item) => item.id === market.instrumentId);
  if (!instrument) {
    return reject(state, command, "INSTRUMENT_NOT_TRADEABLE", market.instrumentId, timestamp);
  }
  if (command.orderType !== "LIMIT" || !market.allowedOrderTypes.includes(command.orderType)) {
    return reject(state, command, "UNSUPPORTED_ORDER_TYPE", instrument.id, timestamp);
  }
  if (instrument.instrumentType === "PROTOCOL_INVESTMENT") {
    return reject(state, command, "PROTOCOL_INVESTMENT_NOT_TRADEABLE", instrument.id, timestamp);
  }
  if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
    return reject(state, command, "INVALID_QUANTITY", instrument.id, timestamp);
  }
  if (market.wholeQuantityOnly && instrument.decimals === 0 && !Number.isInteger(command.quantity)) {
    return reject(state, command, "INVALID_QUANTITY", instrument.id, timestamp);
  }
  if (!Number.isInteger(command.price) || command.price <= 0) {
    return reject(state, command, "INVALID_PRICE", instrument.id, timestamp);
  }
  if (!market.transacting || market.phase !== "SECONDARY_OPEN") {
    return reject(state, command, "MARKET_CLOSED", instrument.id, timestamp);
  }
  const eligibility = eligibilityFor(state.eligibility, command.participantId, instrument.id);
  if (!canTrade({ eligibility, instrument, market })) {
    return reject(state, command, "INELIGIBLE", instrument.id, timestamp);
  }

  const holding = ensureHolding(
    state,
    command.participantId,
    command.participantId,
    instrument.id,
  );
  let settlementHeld = 0;
  if (command.side === "SELL") {
    if (!hasAvailable(holding, command.quantity)) {
      return reject(state, command, "INSUFFICIENT_AVAILABLE", instrument.id, timestamp);
    }
  } else {
    const required = command.price * command.quantity;
    const account = findAccount(state, command.participantId);
    if (!account) {
      return reject(state, command, "INSUFFICIENT_SETTLEMENT", instrument.id, timestamp);
    }
    const reserved = reserveSettlement(account, required);
    if ("error" in reserved) {
      return reject(state, command, reserved.error, instrument.id, timestamp);
    }
    replaceAccount(state, reserved);
    settlementHeld = required;
  }

  state.nextOrderSeq += 1;
  state.nextOrderId += 1;
  const order: Order = {
    id: nextId("ORD", state.nextOrderId),
    marketId: market.id,
    instrumentId: instrument.id,
    participantId: command.participantId,
    side: command.side,
    orderType: "LIMIT",
    price: command.price,
    originalQuantity: command.quantity,
    remainingQuantity: command.quantity,
    filledQuantity: 0,
    status: "OPEN",
    sequence: state.nextOrderSeq,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceChannel: command.sourceChannel,
  };
  state.orders.push(order);
  pushEvent(state, {
    actor: command.actor,
    participantId: command.participantId,
    instrumentId: instrument.id,
    marketId: market.id,
    entityId: order.id,
    type: "order_submitted",
    timestamp,
    metadata: {
      side: order.side,
      price: order.price,
      quantity: order.originalQuantity,
      sourceChannel: order.sourceChannel,
    },
  });

  if (command.side === "SELL") {
    replaceHolding(state, applyAssetReserve(holding, command.quantity));
    state.nextReservationId += 1;
    state.reservations.push({
      id: nextId("RES", state.nextReservationId),
      orderId: order.id,
      marketId: market.id,
      instrumentId: instrument.id,
      participantId: command.participantId,
      kind: "ASSET",
      quantity: command.quantity,
      status: "ACTIVE",
    });
  } else {
    state.nextReservationId += 1;
    state.reservations.push({
      id: nextId("RES", state.nextReservationId),
      orderId: order.id,
      marketId: market.id,
      instrumentId: instrument.id,
      participantId: command.participantId,
      kind: "SETTLEMENT",
      quantity: settlementHeld,
      status: "ACTIVE",
    });
  }
  pushEvent(state, {
    actor: command.actor,
    participantId: command.participantId,
    instrumentId: instrument.id,
    marketId: market.id,
    entityId: order.id,
    type: "order_reserved",
    timestamp,
    metadata: {
      kind: command.side === "SELL" ? "ASSET" : "SETTLEMENT",
      quantity: command.side === "SELL" ? command.quantity : settlementHeld,
    },
  });

  const fills = matchIncomingOrder(order, state.orders);
  const createdTrades: Trade[] = [];
  let workingIncoming = order;
  for (const fill of fills) {
    const resting = state.orders.find((item) => item.id === fill.restingOrderId);
    if (!resting || workingIncoming.remainingQuantity <= 0) {
      break;
    }
    if (fill.quantity > workingIncoming.remainingQuantity || fill.quantity > resting.remainingQuantity) {
      throw new Error("OVERFILL");
    }
    workingIncoming = applyFillToOrder(workingIncoming, fill.quantity, timestamp);
    const updatedResting = applyFillToOrder(resting, fill.quantity, timestamp);
    replaceOrder(state, workingIncoming);
    replaceOrder(state, updatedResting);

    state.nextTradeId += 1;
    const trade: Trade = {
      id: nextId("TRD", state.nextTradeId),
      marketId: market.id,
      instrumentId: instrument.id,
      buyOrderId: fill.buyOrderId,
      sellOrderId: fill.sellOrderId,
      buyerParticipantId: fill.buyerParticipantId,
      sellerParticipantId: fill.sellerParticipantId,
      quantity: fill.quantity,
      price: fill.price,
      notional: fill.notional,
      status: "MATCHED",
      kind: "SECONDARY",
      createdAt: timestamp,
      updatedAt: timestamp,
      eligibilityRecheckPassed: false,
      dvpStatus: "PENDING",
      registryUpdateStatus: "PENDING",
      finalSettlementStatus: "PENDING",
    };
    pushEvent(state, {
      actor: "MATCHING_ENGINE",
      participantId: command.participantId,
      instrumentId: instrument.id,
      marketId: market.id,
      entityId: workingIncoming.id,
      type: "order_matched",
      timestamp,
      metadata: { tradeId: trade.id, quantity: fill.quantity, price: fill.price },
    });
    pushEvent(state, {
      actor: "MATCHING_ENGINE",
      participantId: null,
      instrumentId: instrument.id,
      marketId: market.id,
      entityId: trade.id,
      type: "trade_created",
      timestamp,
      metadata: {
        quantity: trade.quantity,
        price: trade.price,
        notional: trade.notional,
        execution: "RESTING_ORDER",
      },
    });

    const sellerHolding = ensureHolding(
      state,
      fill.sellerParticipantId,
      fill.sellerParticipantId,
      instrument.id,
    );
    const buyerHolding = ensureHolding(
      state,
      fill.buyerParticipantId,
      fill.buyerParticipantId,
      instrument.id,
    );
    replaceHolding(state, applyMatchedSell(sellerHolding, fill.quantity));
    replaceHolding(state, applyMatchedBuy(buyerHolding, fill.quantity));

    const buyOrder = fill.buyOrderId === workingIncoming.id ? workingIncoming : updatedResting;
    const unused = (buyOrder.price - fill.price) * fill.quantity;
    if (unused > 0) {
      const buyerAccount = findAccount(state, fill.buyerParticipantId);
      if (buyerAccount) {
        replaceAccount(state, releaseSettlement(buyerAccount, unused));
      }
    }

    const advanced = advanceTradeClearing(state, trade, timestamp);
    state.trades.push(advanced);
    createdTrades.push(advanced);

    state.nextSettlementId += 1;
    const settlement: Settlement = {
      id: nextId("SET", state.nextSettlementId),
      tradeId: advanced.id,
      status: "RESERVED",
      evidenceLabel: null,
      kind: "SECONDARY",
    };
    state.settlements.push(settlement);
  }

  if (fills.length > 0) {
    const latestIncoming = state.orders.find((item) => item.id === order.id) ?? workingIncoming;
    if (latestIncoming.side === "BUY") {
      const liveReserve = latestIncoming.price * latestIncoming.remainingQuantity;
      const held = createdTrades
        .filter((trade) => trade.buyOrderId === latestIncoming.id)
        .reduce((sum, trade) => sum + trade.notional, 0);
      const reservation = state.reservations.find(
        (item) => item.orderId === latestIncoming.id && item.kind === "SETTLEMENT",
      );
      if (reservation) {
        reservation.quantity = liveReserve + held;
        reservation.status =
          latestIncoming.remainingQuantity === 0 ? "HELD_PENDING_SETTLEMENT" : "ACTIVE";
      }
    } else {
      const reservation = state.reservations.find(
        (item) => item.orderId === order.id && item.kind === "ASSET",
      );
      if (reservation) {
        reservation.status =
          latestIncoming.remainingQuantity === 0 ? "HELD_PENDING_SETTLEMENT" : "ACTIVE";
      }
    }
    for (const fill of fills) {
      const restingReservation = state.reservations.find(
        (item) => item.orderId === fill.restingOrderId,
      );
      const restingOrder = state.orders.find((item) => item.id === fill.restingOrderId);
      if (restingReservation && restingOrder && restingOrder.remainingQuantity === 0) {
        restingReservation.status = "HELD_PENDING_SETTLEMENT";
      }
    }
  }

  const resultOrder = state.orders.find((item) => item.id === order.id) ?? order;
  return { state, order: resultOrder, trades: createdTrades, error: null };
}

export function cancelOrder(
  current: EngineState,
  command: CancelOrderCommand,
): EngineResult {
  const state = cloneState(current);
  const timestamp = stamp(state, command.now);
  state.now = timestamp;
  const order = state.orders.find((item) => item.id === command.orderId);
  if (!order) {
    return { state, order: null, trades: [], error: "ORDER_NOT_FOUND" };
  }
  if (order.participantId !== command.participantId) {
    return { state, order, trades: [], error: "NOT_OWNER" };
  }
  if (order.status === "FILLED" || order.status === "CANCELLED" || order.status === "REJECTED") {
    return { state, order, trades: [], error: "ORDER_NOT_CANCELABLE" };
  }
  if (order.remainingQuantity <= 0) {
    return { state, order, trades: [], error: "ORDER_NOT_CANCELABLE" };
  }

  if (order.side === "SELL") {
    const holding = findHolding(state, order.participantId, order.instrumentId);
    if (holding) {
      replaceHolding(state, applyAssetRelease(holding, order.remainingQuantity));
    }
  } else {
    const releaseAmount = order.price * order.remainingQuantity;
    const account = findAccount(state, order.participantId);
    if (account && releaseAmount > 0) {
      replaceAccount(state, releaseSettlement(account, releaseAmount));
    }
  }

  const reservation = state.reservations.find(
    (item) => item.orderId === order.id && item.status === "ACTIVE",
  );
  if (reservation) {
    if (order.filledQuantity > 0) {
      reservation.status = "HELD_PENDING_SETTLEMENT";
      reservation.quantity = order.side === "SELL" ? order.filledQuantity : reservation.quantity;
    } else {
      reservation.status = "RELEASED";
    }
  }

  const cancelled: Order = {
    ...order,
    remainingQuantity: 0,
    status: "CANCELLED",
    updatedAt: timestamp,
  };
  replaceOrder(state, cancelled);
  pushEvent(state, {
    actor: command.actor,
    participantId: command.participantId,
    instrumentId: order.instrumentId,
    marketId: order.marketId,
    entityId: order.id,
    type: "order_cancelled",
    timestamp,
    metadata: { released: order.remainingQuantity, filled: order.filledQuantity },
  });
  return { state, order: cancelled, trades: [], error: null };
}

export function legalHoldingsUnchanged(
  before: EngineState,
  after: EngineState,
  participantId: string,
  instrumentId: string,
): boolean {
  const left = findHolding(before, participantId, instrumentId);
  const right = findHolding(after, participantId, instrumentId);
  return (left?.buckets.owned ?? 0) === (right?.buckets.owned ?? 0);
}

export function hasForbiddenSettlementEvent(state: EngineState): boolean {
  return state.events.some(
    (event) =>
      event.type === ("settlement_finalized" as MarketEventType) ||
      event.type === ("registry_transfer_completed" as MarketEventType),
  );
}

export function noTradeIsSettled(state: EngineState): boolean {
  return state.trades.every(
    (trade) =>
      trade.dvpStatus === "PENDING" &&
      trade.registryUpdateStatus === "PENDING" &&
      trade.finalSettlementStatus === "PENDING" &&
      trade.status !== ("SETTLED" as Trade["status"]),
  );
}
