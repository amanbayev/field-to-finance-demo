import { isLiveOrder } from "./matching";
import type { Order } from "./types";

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
  total: number;
}

function aggregate(orders: readonly Order[], descending: boolean): OrderBookLevel[] {
  const byPrice = new Map<number, OrderBookLevel>();
  for (const order of orders) {
    if (!isLiveOrder(order)) {
      continue;
    }
    const current = byPrice.get(order.price);
    if (current) {
      current.quantity += order.remainingQuantity;
      current.orderCount += 1;
      current.total += order.price * order.remainingQuantity;
    } else {
      byPrice.set(order.price, {
        price: order.price,
        quantity: order.remainingQuantity,
        orderCount: 1,
        total: order.price * order.remainingQuantity,
      });
    }
  }
  const levels = [...byPrice.values()];
  levels.sort((a, b) => (descending ? b.price - a.price : a.price - b.price));
  return levels;
}

export function bidsFromOrders(orders: readonly Order[]): OrderBookLevel[] {
  return aggregate(
    orders.filter((order) => order.side === "BUY"),
    true,
  );
}

export function asksFromOrders(orders: readonly Order[]): OrderBookLevel[] {
  return aggregate(
    orders.filter((order) => order.side === "SELL"),
    false,
  );
}
