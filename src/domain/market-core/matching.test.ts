import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canCross,
  compareBuyPriority,
  compareSellPriority,
  matchIncomingOrder,
  RESTING_ORDER_EXECUTION_PRICE_RULE,
  type Order,
} from "@/domain/market-core";

function order(partial: Partial<Order> & Pick<Order, "id" | "side" | "price" | "sequence">): Order {
  return {
    marketId: "MKT-TEST",
    instrumentId: "TEST-INSTRUMENT",
    participantId: partial.participantId ?? `p-${partial.id}`,
    orderType: "LIMIT",
    originalQuantity: partial.originalQuantity ?? 10,
    remainingQuantity: partial.remainingQuantity ?? partial.originalQuantity ?? 10,
    filledQuantity: partial.filledQuantity ?? 0,
    status: partial.status ?? "OPEN",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    sourceChannel: "DIRECT_MTP",
    ...partial,
  };
}

describe("price-time matching", () => {
  it("documents resting-order execution price", () => {
    expect(RESTING_ORDER_EXECUTION_PRICE_RULE).toMatch(/resting/i);
  });

  it("ranks BUY by highest price then earliest sequence", () => {
    const highLate = order({ id: "b1", side: "BUY", price: 110, sequence: 2 });
    const highEarly = order({ id: "b2", side: "BUY", price: 110, sequence: 1 });
    const low = order({ id: "b3", side: "BUY", price: 100, sequence: 0 });
    const ranked = [low, highLate, highEarly].sort(compareBuyPriority);
    expect(ranked.map((item) => item.id)).toEqual(["b2", "b1", "b3"]);
  });

  it("ranks SELL by lowest price then earliest sequence", () => {
    const lowLate = order({ id: "s1", side: "SELL", price: 90, sequence: 2 });
    const lowEarly = order({ id: "s2", side: "SELL", price: 90, sequence: 1 });
    const high = order({ id: "s3", side: "SELL", price: 100, sequence: 0 });
    const ranked = [high, lowLate, lowEarly].sort(compareSellPriority);
    expect(ranked.map((item) => item.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("crosses when best buy price >= best sell price", () => {
    expect(canCross(105_000, 105_000)).toBe(true);
    expect(canCross(106_000, 105_000)).toBe(true);
    expect(canCross(104_000, 105_000)).toBe(false);
  });

  it("uses the resting order price as the execution price", () => {
    const restingSell = order({
      id: "s1",
      side: "SELL",
      price: 100_000,
      sequence: 1,
      participantId: "seller",
      remainingQuantity: 2,
      originalQuantity: 2,
    });
    const incomingBuy = order({
      id: "b1",
      side: "BUY",
      price: 105_000,
      sequence: 2,
      participantId: "buyer",
      remainingQuantity: 2,
      originalQuantity: 2,
    });
    const fills = matchIncomingOrder(incomingBuy, [restingSell, incomingBuy]);
    expect(fills).toHaveLength(1);
    expect(fills[0]?.price).toBe(100_000);
    expect(fills[0]?.notional).toBe(200_000);
  });

  it("does not match the same live order twice in one pass", () => {
    const sell = order({
      id: "s1",
      side: "SELL",
      price: 105_000,
      sequence: 1,
      participantId: "seller",
      remainingQuantity: 2,
      originalQuantity: 2,
    });
    const buy = order({
      id: "b1",
      side: "BUY",
      price: 105_000,
      sequence: 2,
      participantId: "buyer",
      remainingQuantity: 2,
      originalQuantity: 2,
    });
    const fills = matchIncomingOrder(buy, [sell, buy]);
    expect(fills).toHaveLength(1);
    expect(fills[0]?.quantity).toBe(2);
  });

  it("does not match a CANCELLED incoming order even with remainingQuantity > 0", () => {
    const restingSell = order({
      id: "s1",
      side: "SELL",
      price: 100_000,
      sequence: 1,
      participantId: "seller",
      remainingQuantity: 2,
      originalQuantity: 2,
    });
    const cancelledBuy = order({
      id: "b1",
      side: "BUY",
      price: 105_000,
      sequence: 2,
      participantId: "buyer",
      remainingQuantity: 2,
      originalQuantity: 2,
      status: "CANCELLED",
    });
    expect(matchIncomingOrder(cancelledBuy, [restingSell, cancelledBuy])).toEqual([]);
  });

  it("does not match a REJECTED incoming order even with remainingQuantity > 0", () => {
    const restingBuy = order({
      id: "b1",
      side: "BUY",
      price: 105_000,
      sequence: 1,
      participantId: "buyer",
      remainingQuantity: 2,
      originalQuantity: 2,
    });
    const rejectedSell = order({
      id: "s1",
      side: "SELL",
      price: 100_000,
      sequence: 2,
      participantId: "seller",
      remainingQuantity: 2,
      originalQuantity: 2,
      status: "REJECTED",
    });
    expect(matchIncomingOrder(rejectedSell, [restingBuy, rejectedSell])).toEqual([]);
  });
});

describe("asset-neutral matching source", () => {
  it("does not import protocol-specific agriculture modules", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = [
      "matching.ts",
      "engine.ts",
      "reservation.ts",
      "settlement-provider.ts",
      "order-book.ts",
    ]
      .map((file) => readFileSync(join(here, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/from ["']@\/domain\/coverage-engine/);
    expect(source).not.toMatch(/from ["']@\/data\/mock\/scas/);
    expect(source).not.toMatch(/agricultural_registry/);
    expect(source).not.toMatch(/WheatOrder|WheatTrade|GrainOrderBook/);
  });
});
