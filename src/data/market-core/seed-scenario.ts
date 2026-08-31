import {
  DEMO_SETTLEMENT_ASSET_ID,
  GRAIN_DESK_ID,
  STEPPE_CAPITAL_ID,
  WHEAT_DEMO_MARKET_ID,
  createEngineState,
  submitLimitOrder,
  type EngineState,
} from "@/domain/market-core";
import {
  eligibilityMatrix,
  holdings,
  marketInstruments,
  markets,
} from "@/data/market-core/catalog";

export const FIRST_SCENARIO_PRICE = 105_000;
export const FIRST_SCENARIO_QUANTITY = 2;
export const FIRST_SCENARIO_NOTIONAL = FIRST_SCENARIO_PRICE * FIRST_SCENARIO_QUANTITY;

export function wheatEngineBaseState(): EngineState {
  return createEngineState({
    markets: structuredClone(markets),
    instruments: structuredClone(marketInstruments),
    holdings: structuredClone(holdings),
    eligibility: structuredClone(eligibilityMatrix),
    settlementAccounts: [
      {
        participantId: STEPPE_CAPITAL_ID,
        assetId: DEMO_SETTLEMENT_ASSET_ID,
        available: 500_000,
        reserved: 0,
      },
      {
        participantId: GRAIN_DESK_ID,
        assetId: DEMO_SETTLEMENT_ASSET_ID,
        available: 1_000_000,
        reserved: 0,
      },
    ],
  });
}

export function seedFirstWheatSecondaryScenario(
  base: EngineState = wheatEngineBaseState(),
): EngineState {
  const sell = submitLimitOrder(base, {
    marketId: WHEAT_DEMO_MARKET_ID,
    participantId: STEPPE_CAPITAL_ID,
    actor: "DEMO-FUND-001",
    side: "SELL",
    orderType: "LIMIT",
    price: FIRST_SCENARIO_PRICE,
    quantity: FIRST_SCENARIO_QUANTITY,
    sourceChannel: "DIRECT_MTP",
    now: "2026-08-23T10:00:00.000Z",
  });
  if (sell.error || !sell.order) {
    throw new Error(sell.error ?? "seed sell failed");
  }
  const buy = submitLimitOrder(sell.state, {
    marketId: WHEAT_DEMO_MARKET_ID,
    participantId: GRAIN_DESK_ID,
    actor: "DEMO-TRADER-001",
    side: "BUY",
    orderType: "LIMIT",
    price: FIRST_SCENARIO_PRICE,
    quantity: FIRST_SCENARIO_QUANTITY,
    sourceChannel: "DIRECT_MTP",
    now: "2026-08-23T10:01:00.000Z",
  });
  if (buy.error) {
    throw new Error(buy.error);
  }
  return buy.state;
}
