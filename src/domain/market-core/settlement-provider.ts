import type { SettlementAccount } from "./types";

export const DEMO_SETTLEMENT_ASSET_ID = "DEMO-KZT";

export class DevnetSettlementNotEnabledError extends Error {
  constructor() {
    super("Devnet settlement is not enabled in Phase 5B Preview. Trades must not be marked SETTLED.");
    this.name = "DevnetSettlementNotEnabledError";
  }
}

export interface SettlementProvider {
  reserve(participantId: string, amount: number): SettlementAccount;
  release(participantId: string, amount: number): SettlementAccount;
  settle(tradeId: string): never;
}

export function settlementCapacity(account: SettlementAccount): number {
  return account.available;
}

export function reserveSettlement(
  account: SettlementAccount,
  amount: number,
): SettlementAccount | { error: "INSUFFICIENT_SETTLEMENT" } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: "INSUFFICIENT_SETTLEMENT" };
  }
  if (account.available < amount) {
    return { error: "INSUFFICIENT_SETTLEMENT" };
  }
  return {
    ...account,
    available: account.available - amount,
    reserved: account.reserved + amount,
  };
}

export function releaseSettlement(
  account: SettlementAccount,
  amount: number,
): SettlementAccount {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("invalid settlement release");
  }
  if (account.reserved < amount) {
    throw new Error("settlement release exceeds reserved");
  }
  return {
    ...account,
    available: account.available + amount,
    reserved: account.reserved - amount,
  };
}

export function demoSettle(): never {
  throw new DevnetSettlementNotEnabledError();
}

export class DemoSettlementProvider implements SettlementProvider {
  constructor(private accounts: Map<string, SettlementAccount>) {}

  reserve(participantId: string, amount: number): SettlementAccount {
    const current = this.accounts.get(participantId);
    if (!current) {
      throw new Error("missing settlement account");
    }
    const next = reserveSettlement(current, amount);
    if ("error" in next) {
      throw new Error(next.error);
    }
    this.accounts.set(participantId, next);
    return next;
  }

  release(participantId: string, amount: number): SettlementAccount {
    const current = this.accounts.get(participantId);
    if (!current) {
      throw new Error("missing settlement account");
    }
    const next = releaseSettlement(current, amount);
    this.accounts.set(participantId, next);
    return next;
  }

  settle(tradeId: string): never {
    void tradeId;
    return demoSettle();
  }
}
