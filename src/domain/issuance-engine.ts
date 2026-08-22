/**
 * Off-chain issuance capacity.
 *
 * Outstanding commodity tokens cannot exceed attested eligible coverage.
 * Prepared (unminted) volume is reserved against the same cap.
 * All quantities are non-negative integers. No floating-point.
 *
 * Token-2022 mint/burn stay with the Registrar. This engine does not mint.
 */

export type IssuanceDecisionReason =
  | "ok"
  | "not_integer"
  | "not_positive"
  | "exceeds_coverage"
  | "mint_not_deployed";

export interface IssuancePosition {
  eligibleCoverageTonnes: number;
  outstandingTokens: number;
  reservedTokens: number;
}

export interface IssuanceDecision {
  allowed: boolean;
  remaining: number;
  reason: IssuanceDecisionReason;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function remainingIssuanceCapacity(position: IssuancePosition): number {
  if (
    !isNonNegativeInteger(position.eligibleCoverageTonnes) ||
    !isNonNegativeInteger(position.outstandingTokens) ||
    !isNonNegativeInteger(position.reservedTokens)
  ) {
    throw new Error("issuance position must use non-negative integers");
  }
  const used = position.outstandingTokens + position.reservedTokens;
  return Math.max(0, position.eligibleCoverageTonnes - used);
}

export function evaluatePrepareTranche(
  position: IssuancePosition,
  amount: number,
): IssuanceDecision {
  const remaining = remainingIssuanceCapacity(position);
  if (!Number.isInteger(amount)) {
    return { allowed: false, remaining, reason: "not_integer" };
  }
  if (amount <= 0) {
    return { allowed: false, remaining, reason: "not_positive" };
  }
  if (amount > remaining) {
    return { allowed: false, remaining, reason: "exceeds_coverage" };
  }
  return { allowed: true, remaining, reason: "ok" };
}

export function evaluateMintTranche(
  position: IssuancePosition,
  amount: number,
  mintDeployed: boolean,
): IssuanceDecision {
  if (!mintDeployed) {
    return {
      allowed: false,
      remaining: remainingIssuanceCapacity(position),
      reason: "mint_not_deployed",
    };
  }
  return evaluatePrepareTranche(position, amount);
}
