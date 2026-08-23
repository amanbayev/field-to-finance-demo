import { describe, expect, it } from "vitest";
import {
  LOCKED_SEED_TRADE,
  assertSettlementMatchesLockedTrade,
} from "./secondary-settlement-binding";
import { SecondarySettlementProvider } from "./secondary-settlement-provider";
import { DevnetSettlementNotEnabledError } from "./settlement-provider";

const valid = {
  tradeId: LOCKED_SEED_TRADE.tradeId,
  marketId: LOCKED_SEED_TRADE.marketId,
  sellerParticipantId: LOCKED_SEED_TRADE.sellerParticipantId,
  buyerParticipantId: LOCKED_SEED_TRADE.buyerParticipantId,
  instrumentId: LOCKED_SEED_TRADE.instrumentId,
  quantity: 2,
  unitPrice: 105_000,
  notional: 210_000,
};

describe("secondary settlement binding", () => {
  it("accepts args that match the locked TRD-SEED-001 record", () => {
    expect(assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, valid)).toEqual({
      ok: true,
    });
  });

  it("rejects operator changes to buyer, seller, quantity, or price", () => {
    expect(
      assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, {
        ...valid,
        buyerParticipantId: "STRANGER",
      }),
    ).toEqual({ ok: false, error: "BUYER_MISMATCH" });
    expect(
      assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, {
        ...valid,
        sellerParticipantId: "STRANGER",
      }),
    ).toEqual({ ok: false, error: "SELLER_MISMATCH" });
    expect(
      assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, {
        ...valid,
        quantity: 3,
        notional: 315_000,
      }),
    ).toEqual({ ok: false, error: "QUANTITY_MISMATCH" });
    expect(
      assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, {
        ...valid,
        unitPrice: 100_000,
        notional: 200_000,
      }),
    ).toEqual({ ok: false, error: "PRICE_MISMATCH" });
    expect(
      assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, {
        ...valid,
        tradeId: "TRD-OTHER",
      }),
    ).toEqual({ ok: false, error: "TRADE_ID_MISMATCH" });
    expect(
      assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, {
        ...valid,
        marketId: "MKT-TEST-ISO-5B1",
      }),
    ).toEqual({ ok: false, error: "MARKET_MISMATCH" });
  });

  it("keeps the provider disabled and never submits a chain transfer", () => {
    const provider = new SecondarySettlementProvider();
    expect(provider.enabled).toBe(false);
    expect(provider.canExecute()).toBe(false);
    expect(() => provider.settle(valid)).toThrow(DevnetSettlementNotEnabledError);
  });
});
