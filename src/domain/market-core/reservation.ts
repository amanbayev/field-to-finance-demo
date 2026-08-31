import { availableBalance, withAvailable } from "./eligibility";
import type { Holding, HoldingBuckets } from "./types";

export function emptyBuckets(owned: number): HoldingBuckets {
  return {
    owned,
    reservedForOrders: 0,
    pledged: 0,
    blocked: 0,
    pendingIn: 0,
    pendingOut: 0,
  };
}

export function legalOwnedUnchanged(
  before: HoldingBuckets,
  after: HoldingBuckets,
): boolean {
  return before.owned === after.owned;
}

export function applyAssetReserve(holding: Holding, quantity: number): Holding {
  const buckets: HoldingBuckets = {
    ...holding.buckets,
    reservedForOrders: holding.buckets.reservedForOrders + quantity,
  };
  return { ...holding, ...withAvailable(buckets) };
}

export function applyAssetRelease(holding: Holding, quantity: number): Holding {
  const buckets: HoldingBuckets = {
    ...holding.buckets,
    reservedForOrders: holding.buckets.reservedForOrders - quantity,
  };
  if (buckets.reservedForOrders < 0) {
    throw new Error("reservation would go negative");
  }
  return { ...holding, ...withAvailable(buckets) };
}

export function applyMatchedSell(holding: Holding, quantity: number): Holding {
  const buckets: HoldingBuckets = {
    ...holding.buckets,
    pendingOut: holding.buckets.pendingOut + quantity,
  };
  return { ...holding, ...withAvailable(buckets) };
}

export function applyMatchedBuy(holding: Holding, quantity: number): Holding {
  const buckets: HoldingBuckets = {
    ...holding.buckets,
    pendingIn: holding.buckets.pendingIn + quantity,
  };
  return { ...holding, ...withAvailable(buckets) };
}

export function hasAvailable(holding: Holding, quantity: number): boolean {
  return availableBalance(holding.buckets) >= quantity && quantity > 0;
}
