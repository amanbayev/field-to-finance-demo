import { describe, expect, it } from "vitest";
import {
  DEMO_SETTLEMENT_ASSET_ID,
  GRAIN_DESK_ID,
  STEPPE_CAPITAL_ID,
  WHEAT_DEMO_MARKET_ID,
  TRADE_STATUSES,
  availableBalance,
  cancelOrder,
  canReceive,
  canTrade,
  createEngineState,
  demoSettle,
  DevnetSettlementNotEnabledError,
  hasForbiddenSettlementEvent,
  legalHoldingsUnchanged,
  noTradeIsSettled,
  recheckAndAdvanceClearing,
  submitLimitOrder,
  type EngineState,
  type Market,
  type MarketInstrument,
} from "@/domain/market-core";
import {
  F2F_PROTOCOL_INVESTMENT_ID,
  instrumentById,
} from "@/data/market-core/catalog";
import {
  seedFirstWheatSecondaryScenario,
  wheatEngineBaseState,
} from "@/data/market-core/seed-scenario";

function testInstrument(): MarketInstrument {
  return {
    id: "TEST-INSTRUMENT",
    symbol: "TEST-INSTRUMENT",
    name: "Synthetic test instrument",
    instrumentType: "ASSET_TOKEN",
    assetProtocolId: "TEST-PROTOCOL",
    protocolVersionId: "TEST-PROTOCOL-V1",
    assetClass: "WATER",
    issuerId: "test-issuer",
    issuerName: "Test Issuer",
    issuanceId: "TEST-ISS",
    legalClassification: "Test",
    denomination: "1 token",
    decimals: 0,
    currencyOrUnit: "u",
    transferPolicy: "Test",
    eligibilityPolicy: "Participant × instrument",
    settlementPolicy: "DEMO-KZT",
    custodyPolicy: "Test",
    status: "ISSUED",
  };
}

function testMarket(instrumentId = "TEST-INSTRUMENT"): Market {
  return {
    id: "MKT-TEST",
    instrumentId,
    phase: "SECONDARY_OPEN",
    activeChannel: "DIRECT_MTP",
    transacting: true,
    matchingEnabled: true,
    settlementEnabled: false,
    demonstratorStatus: "DEMO_OPEN",
    settlementAssetId: DEMO_SETTLEMENT_ASSET_ID,
    settlementAssetLabel: "DEMO-KZT",
    settlementHasMonetaryValue: false,
    marketType: "REGULATED_INSTITUTIONAL_DEMONSTRATOR",
    allowedOrderTypes: ["LIMIT"],
    wholeQuantityOnly: true,
  };
}

function testState(overrides?: {
  sellerAvailable?: number;
  buyerCash?: number;
  sellerEligible?: boolean;
  buyerEligible?: boolean;
}): EngineState {
  const instrument = testInstrument();
  return createEngineState({
    markets: [testMarket(instrument.id)],
    instruments: [instrument],
    holdings: [
      {
        id: "hld-seller",
        instrumentId: instrument.id,
        holderReference: "SELLER",
        holderName: "Seller",
        buckets: {
          owned: overrides?.sellerAvailable ?? 10,
          reservedForOrders: 0,
          pledged: 0,
          blocked: 0,
          pendingIn: 0,
          pendingOut: 0,
        },
        available: overrides?.sellerAvailable ?? 10,
      },
      {
        id: "hld-buyer",
        instrumentId: instrument.id,
        holderReference: "BUYER",
        holderName: "Buyer",
        buckets: {
          owned: 0,
          reservedForOrders: 0,
          pledged: 0,
          blocked: 0,
          pendingIn: 0,
          pendingOut: 0,
        },
        available: 0,
      },
    ],
    eligibility: [
      {
        participantReference: "SELLER",
        participantName: "Seller",
        instrumentId: instrument.id,
        state: overrides?.sellerEligible === false ? "NOT_ELIGIBLE" : "ELIGIBLE",
      },
      {
        participantReference: "BUYER",
        participantName: "Buyer",
        instrumentId: instrument.id,
        state: overrides?.buyerEligible === false ? "NOT_ELIGIBLE" : "ELIGIBLE",
      },
    ],
    settlementAccounts: [
      {
        participantId: "BUYER",
        assetId: DEMO_SETTLEMENT_ASSET_ID,
        available: overrides?.buyerCash ?? 1_000_000,
        reserved: 0,
      },
      {
        participantId: "SELLER",
        assetId: DEMO_SETTLEMENT_ASSET_ID,
        available: 0,
        reserved: 0,
      },
    ],
  });
}

function sell(state: EngineState, quantity: number, price: number, now?: string) {
  return submitLimitOrder(state, {
    marketId: "MKT-TEST",
    participantId: "SELLER",
    actor: "seller-actor",
    side: "SELL",
    orderType: "LIMIT",
    price,
    quantity,
    sourceChannel: "DIRECT_MTP",
    now,
  });
}

function buy(state: EngineState, quantity: number, price: number, now?: string) {
  return submitLimitOrder(state, {
    marketId: "MKT-TEST",
    participantId: "BUYER",
    actor: "buyer-actor",
    side: "BUY",
    orderType: "LIMIT",
    price,
    quantity,
    sourceChannel: "DIRECT_MTP",
    now,
  });
}

describe("generic TEST-INSTRUMENT engine", () => {
  it("matches BUY and SELL on a non-agriculture instrument", () => {
    const posted = sell(testState(), 2, 50);
    expect(posted.error).toBeNull();
    const matched = buy(posted.state, 2, 50);
    expect(matched.error).toBeNull();
    expect(matched.trades).toHaveLength(1);
    expect(matched.trades[0]?.price).toBe(50);
    expect(matched.trades[0]?.quantity).toBe(2);
    expect(matched.trades[0]?.instrumentId).toBe("TEST-INSTRUMENT");
    expect(matched.trades[0]?.status).toBe("AWAITING_DEVNET_SETTLEMENT");
  });

  it("supports partial fills and multiple fills with whole quantities", () => {
    let state = testState({ sellerAvailable: 10 });
    state = buy(state, 3, 10).state;
    state = buy(state, 4, 10).state;
    const result = sell(state, 10, 10);
    expect(result.error).toBeNull();
    expect(result.order?.filledQuantity).toBe(7);
    expect(result.order?.remainingQuantity).toBe(3);
    expect(result.order?.status).toBe("PARTIALLY_FILLED");
    expect(result.trades).toHaveLength(2);
    expect(result.trades.every((trade) => Number.isInteger(trade.quantity))).toBe(true);
    const seller = result.state.holdings.find((row) => row.holderReference === "SELLER")!;
    expect(seller.buckets.owned).toBe(10);
    expect(availableBalance(seller.buckets)).toBe(0);
    expect(seller.buckets.reservedForOrders).toBe(10);
    expect(seller.buckets.pendingOut).toBe(7);
  });

  it("cancels remaining quantity and releases reservation", () => {
    const posted = sell(testState(), 2, 40);
    const cancelled = cancelOrder(posted.state, {
      orderId: posted.order!.id,
      participantId: "SELLER",
      actor: "seller-actor",
    });
    expect(cancelled.error).toBeNull();
    expect(cancelled.order?.status).toBe("CANCELLED");
    const seller = cancelled.state.holdings.find((row) => row.holderReference === "SELLER")!;
    expect(seller.buckets.reservedForOrders).toBe(0);
    expect(availableBalance(seller.buckets)).toBe(10);
  });

  it("reserves DEMO settlement capacity on BUY and rejects insufficient cash", () => {
    const posted = sell(testState(), 2, 100);
    const ok = buy(posted.state, 2, 100);
    expect(ok.error).toBeNull();
    const buyer = ok.state.settlementAccounts.find((row) => row.participantId === "BUYER")!;
    expect(buyer.reserved).toBe(200);
    expect(buyer.available).toBe(1_000_000 - 200);
    const poor = buy(sell(testState({ buyerCash: 50 }), 2, 100).state, 2, 100);
    expect(poor.error).toBe("INSUFFICIENT_SETTLEMENT");
  });

  it("rejects sell above available balance", () => {
    const result = sell(testState({ sellerAvailable: 1 }), 2, 10);
    expect(result.error).toBe("INSUFFICIENT_AVAILABLE");
  });

  it("rejects ineligible participants", () => {
    const result = sell(testState({ sellerEligible: false }), 1, 10);
    expect(result.error).toBe("INELIGIBLE");
  });

  it("keeps MATCHED when canReceive fails and does not settle", () => {
    const posted = sell(testState(), 1, 10);
    const matched = buy(posted.state, 1, 10);
    expect(matched.trades[0]?.status).toBe("AWAITING_DEVNET_SETTLEMENT");
    const blocked: EngineState = {
      ...matched.state,
      eligibility: matched.state.eligibility.map((row) =>
        row.participantReference === "BUYER" ? { ...row, state: "NOT_ELIGIBLE" } : row,
      ),
    };
    const rechecked = recheckAndAdvanceClearing(blocked, matched.trades[0]!.id);
    const trade = rechecked.trades.find((item) => item.id === matched.trades[0]!.id)!;
    expect(trade.status).toBe("MATCHED");
    expect(trade.eligibilityRecheckPassed).toBe(false);
    expect(trade.dvpStatus).toBe("PENDING");
    expect(noTradeIsSettled(rechecked)).toBe(true);
  });

  it("does not overfill remaining quantity", () => {
    const posted = sell(testState(), 2, 10);
    const result = buy(posted.state, 5, 10);
    expect(result.trades[0]?.quantity).toBe(2);
    expect(result.state.orders.find((order) => order.side === "SELL")?.remainingQuantity).toBe(0);
    expect(result.state.orders.find((order) => order.side === "BUY")?.remainingQuantity).toBe(3);
  });

  it("rejects non-integer quantity", () => {
    const result = sell(testState(), 1.5, 10);
    expect(result.error).toBe("INVALID_QUANTITY");
  });

  it("rejects a second SELL that would double-spend available tokens", () => {
    const first = sell(testState({ sellerAvailable: 10 }), 6, 10);
    expect(first.error).toBeNull();
    const second = sell(first.state, 5, 10);
    expect(second.error).toBe("INSUFFICIENT_AVAILABLE");
    expect(second.state.orders.filter((order) => order.status === "OPEN")).toHaveLength(1);
  });

  it("does not rematch a FILLED sell order", () => {
    const posted = sell(testState(), 2, 10);
    const first = buy(posted.state, 2, 10);
    expect(first.trades).toHaveLength(1);
    const second = buy(first.state, 2, 10);
    expect(second.trades).toHaveLength(0);
    expect(second.order?.status).toBe("OPEN");
    expect(first.state.orders.find((order) => order.side === "SELL")?.status).toBe("FILLED");
  });
});

describe("first WHEAT-2027 secondary scenario", () => {
  it("matches 2 tokens at 105,000 DEMO-KZT without changing legal ownership", () => {
    const before = wheatEngineBaseState();
    const after = seedFirstWheatSecondaryScenario(before);
    const steppeBefore = before.holdings.find((row) => row.holderReference === STEPPE_CAPITAL_ID)!;
    const steppe = after.holdings.find((row) => row.holderReference === STEPPE_CAPITAL_ID)!;
    const grain = after.holdings.find((row) => row.holderReference === GRAIN_DESK_ID)!;
    const registrar = after.holdings.find((row) => row.holderReference === "REGISTRAR")!;
    expect(steppe.buckets.owned).toBe(10);
    expect(availableBalance(steppe.buckets)).toBe(8);
    expect(steppe.buckets.reservedForOrders).toBe(2);
    expect(steppe.buckets.pendingOut).toBe(2);
    expect(grain.buckets.owned).toBe(0);
    expect(grain.buckets.pendingIn).toBe(2);
    expect(registrar.buckets.owned).toBe(990);
    expect(legalHoldingsUnchanged(before, after, STEPPE_CAPITAL_ID, "WHEAT-2027")).toBe(true);
    expect(steppeBefore.buckets.owned).toBe(steppe.buckets.owned);
    expect(after.trades).toHaveLength(1);
    expect(after.trades[0]?.price).toBe(105_000);
    expect(after.trades[0]?.notional).toBe(210_000);
    expect(after.trades[0]?.status).toBe("AWAITING_DEVNET_SETTLEMENT");
    expect(after.orders.every((order) => order.status === "FILLED")).toBe(true);
    expect(noTradeIsSettled(after)).toBe(true);
    expect(hasForbiddenSettlementEvent(after)).toBe(false);
    expect(after.events.some((event) => event.type === "order_submitted")).toBe(true);
    expect(after.events.some((event) => event.type === "order_reserved")).toBe(true);
    expect(after.events.some((event) => event.type === "order_matched")).toBe(true);
    expect(after.events.some((event) => event.type === "trade_created")).toBe(true);
    expect(after.events.some((event) => event.type === "clearing_started")).toBe(true);
    expect(after.events.some((event) => event.type === "eligibility_rechecked")).toBe(true);
    expect(after.events.some((event) => event.type === "settlement_reservation_confirmed")).toBe(
      true,
    );
    expect(() => demoSettle()).toThrow(DevnetSettlementNotEnabledError);
    expect((TRADE_STATUSES as readonly string[]).includes("SETTLED")).toBe(false);
  });
});

describe("protocol investment remains untradeable", () => {
  it("keeps canTrade false for F2F-PROTOCOL-INVESTMENT", () => {
    const instrument = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
    const market = wheatEngineBaseState().markets[0]!;
    expect(
      canTrade({
        eligibility: "ELIGIBLE",
        instrument,
        market: { ...market, instrumentId: instrument.id },
      }),
    ).toBe(false);
    expect(canReceive({ eligibility: "ELIGIBLE", instrument })).toBe(false);
    const state = createEngineState({
      markets: [{ ...market, instrumentId: instrument.id }],
      instruments: [instrument],
      holdings: wheatEngineBaseState().holdings,
      eligibility: [
        {
          participantReference: STEPPE_CAPITAL_ID,
          participantName: "Steppe Capital",
          instrumentId: instrument.id,
          state: "ELIGIBLE",
        },
      ],
      settlementAccounts: wheatEngineBaseState().settlementAccounts,
    });
    const result = submitLimitOrder(state, {
      marketId: WHEAT_DEMO_MARKET_ID,
      participantId: STEPPE_CAPITAL_ID,
      actor: "DEMO-FUND-001",
      side: "BUY",
      orderType: "LIMIT",
      price: 1,
      quantity: 1,
      sourceChannel: "DIRECT_MTP",
    });
    expect(result.error).toBe("PROTOCOL_INVESTMENT_NOT_TRADEABLE");
  });
});
