/**
 * Off-chain lock: the execution adapter may only build settle_secondary_dvp
 * from the matched trade record. Operator input cannot change parties or terms.
 */

export interface LockedSecondaryTrade {
  tradeId: string;
  marketId: string;
  sellerParticipantId: string;
  buyerParticipantId: string;
  instrumentId: string;
  quantity: number;
  unitPrice: number;
  notional: number;
}

export interface SecondarySettlementInstructionArgs {
  tradeId: string;
  marketId: string;
  sellerParticipantId: string;
  buyerParticipantId: string;
  instrumentId: string;
  quantity: number;
  unitPrice: number;
  notional: number;
}

export type SettlementBindingError =
  | "TRADE_ID_MISMATCH"
  | "MARKET_MISMATCH"
  | "SELLER_MISMATCH"
  | "BUYER_MISMATCH"
  | "INSTRUMENT_MISMATCH"
  | "QUANTITY_MISMATCH"
  | "PRICE_MISMATCH"
  | "NOTIONAL_MISMATCH";

export function assertSettlementMatchesLockedTrade(
  trade: LockedSecondaryTrade,
  args: SecondarySettlementInstructionArgs,
): { ok: true } | { ok: false; error: SettlementBindingError } {
  if (args.tradeId !== trade.tradeId) {
    return { ok: false, error: "TRADE_ID_MISMATCH" };
  }
  if (args.marketId !== trade.marketId) {
    return { ok: false, error: "MARKET_MISMATCH" };
  }
  if (args.sellerParticipantId !== trade.sellerParticipantId) {
    return { ok: false, error: "SELLER_MISMATCH" };
  }
  if (args.buyerParticipantId !== trade.buyerParticipantId) {
    return { ok: false, error: "BUYER_MISMATCH" };
  }
  if (args.instrumentId !== trade.instrumentId) {
    return { ok: false, error: "INSTRUMENT_MISMATCH" };
  }
  if (args.quantity !== trade.quantity) {
    return { ok: false, error: "QUANTITY_MISMATCH" };
  }
  if (args.unitPrice !== trade.unitPrice) {
    return { ok: false, error: "PRICE_MISMATCH" };
  }
  if (args.notional !== trade.notional || args.quantity * args.unitPrice !== args.notional) {
    return { ok: false, error: "NOTIONAL_MISMATCH" };
  }
  return { ok: true };
}

export const LOCKED_SEED_TRADE: LockedSecondaryTrade = {
  tradeId: "TRD-SEED-001",
  marketId: "MKT-WHEAT-2027-DEMO-KZT",
  sellerParticipantId: "INVESTOR-0001",
  buyerParticipantId: "GRAIN-DESK",
  instrumentId: "WHEAT-2027",
  quantity: 2,
  unitPrice: 105_000,
  notional: 210_000,
};
