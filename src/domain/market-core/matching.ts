import type { Order, OrderSide } from "./types";

/**
 * Execution price is the limit price of the RESTING order already on the book.
 * The incoming order is the aggressor and does not set the trade price.
 * Matching is deterministic and non-discretionary: an operator cannot choose
 * counterparties.
 */
export const RESTING_ORDER_EXECUTION_PRICE_RULE =
  "Execution price is the limit price of the resting order. Incoming orders do not set the trade price. Matching is price-time priority and non-discretionary.";

export function isLiveOrder(order: Order): boolean {
  return (
    (order.status === "OPEN" || order.status === "PARTIALLY_FILLED") &&
    order.remainingQuantity > 0
  );
}

export function compareBuyPriority(a: Order, b: Order): number {
  if (a.price !== b.price) {
    return b.price - a.price;
  }
  return a.sequence - b.sequence;
}

export function compareSellPriority(a: Order, b: Order): number {
  if (a.price !== b.price) {
    return a.price - b.price;
  }
  return a.sequence - b.sequence;
}

export function canCross(buyPrice: number, sellPrice: number): boolean {
  return buyPrice >= sellPrice;
}

export interface MatchFill {
  incomingOrderId: string;
  restingOrderId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerParticipantId: string;
  sellerParticipantId: string;
  quantity: number;
  price: number;
  notional: number;
}

export function counterpartiesFor(
  incoming: Order,
  book: readonly Order[],
): Order[] {
  const live = book.filter(
    (order) =>
      isLiveOrder(order) &&
      order.id !== incoming.id &&
      order.marketId === incoming.marketId &&
      order.instrumentId === incoming.instrumentId &&
      order.participantId !== incoming.participantId,
  );
  if (incoming.side === "BUY") {
    return live.filter((order) => order.side === "SELL").sort(compareSellPriority);
  }
  return live.filter((order) => order.side === "BUY").sort(compareBuyPriority);
}

export function matchIncomingOrder(
  incoming: Order,
  book: readonly Order[],
): MatchFill[] {
  if (!isLiveOrder(incoming) && incoming.remainingQuantity <= 0) {
    return [];
  }
  const remainingById = new Map<string, number>();
  for (const order of book) {
    remainingById.set(order.id, order.remainingQuantity);
  }
  remainingById.set(incoming.id, incoming.remainingQuantity);

  const fills: MatchFill[] = [];
  for (const resting of counterpartiesFor(incoming, book)) {
    const incomingRemaining = remainingById.get(incoming.id) ?? 0;
    const restingRemaining = remainingById.get(resting.id) ?? 0;
    if (incomingRemaining <= 0) {
      break;
    }
    if (restingRemaining <= 0) {
      continue;
    }
    const buy = incoming.side === "BUY" ? incoming : resting;
    const sell = incoming.side === "SELL" ? incoming : resting;
    if (!canCross(buy.price, sell.price)) {
      break;
    }
    const quantity = Math.min(incomingRemaining, restingRemaining);
    if (quantity <= 0) {
      continue;
    }
    const price = resting.price;
    fills.push({
      incomingOrderId: incoming.id,
      restingOrderId: resting.id,
      buyOrderId: buy.id,
      sellOrderId: sell.id,
      buyerParticipantId: buy.participantId,
      sellerParticipantId: sell.participantId,
      quantity,
      price,
      notional: price * quantity,
    });
    remainingById.set(incoming.id, incomingRemaining - quantity);
    remainingById.set(resting.id, restingRemaining - quantity);
  }
  return fills;
}

export function orderStatusAfterFill(
  filledQuantity: number,
  remainingQuantity: number,
): Order["status"] {
  if (remainingQuantity === 0 && filledQuantity > 0) {
    return "FILLED";
  }
  if (filledQuantity > 0 && remainingQuantity > 0) {
    return "PARTIALLY_FILLED";
  }
  return "OPEN";
}

export function bookSide(orders: readonly Order[], side: OrderSide): Order[] {
  return orders.filter((order) => order.side === side && isLiveOrder(order));
}
