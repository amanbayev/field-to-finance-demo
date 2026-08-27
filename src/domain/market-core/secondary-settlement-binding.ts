/**
 * Off-chain lock: the execution adapter may only build settle_secondary_dvp
 * from the matched trade record. Operator input cannot change parties or terms.
 */

import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

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

/** Domain separator. Must match `CANONICAL_TRADE_HASH_DOMAIN` in the programme. */
export const CANONICAL_TRADE_HASH_DOMAIN = "F2F_SECONDARY_DVP_V1";

export interface CanonicalSecondaryTradeInput {
  tradeId: string;
  marketId: string;
  marketConfig: string;
  sellerWallet: string;
  buyerWallet: string;
  instrumentMint: string;
  settlementMint: string;
  quantity: number;
  unitPrice: number;
  notional: number;
}

function u32Le(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function u64Le(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

export function canonicalSecondaryTradeHash(
  input: CanonicalSecondaryTradeInput,
): Buffer {
  const tradeId = Buffer.from(input.tradeId, "utf8");
  const marketId = Buffer.from(input.marketId, "utf8");
  return createHash("sha256")
    .update(Buffer.from(CANONICAL_TRADE_HASH_DOMAIN, "utf8"))
    .update(u32Le(tradeId.length))
    .update(tradeId)
    .update(u32Le(marketId.length))
    .update(marketId)
    .update(new PublicKey(input.marketConfig).toBytes())
    .update(new PublicKey(input.sellerWallet).toBytes())
    .update(new PublicKey(input.buyerWallet).toBytes())
    .update(new PublicKey(input.instrumentMint).toBytes())
    .update(new PublicKey(input.settlementMint).toBytes())
    .update(u64Le(input.quantity))
    .update(u64Le(input.unitPrice))
    .update(u64Le(input.notional))
    .digest();
}

export function canonicalSecondaryTradeHashHex(
  input: CanonicalSecondaryTradeInput,
): string {
  return canonicalSecondaryTradeHash(input).toString("hex");
}
