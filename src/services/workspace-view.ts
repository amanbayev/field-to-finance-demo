import type {
  ComplianceRecord,
  ContractCoverage,
  ContractVerification,
  CoverageStatus,
  DigitalAgriculturalContract,
} from "@/domain";
import { remainingIssuanceCapacity } from "@/domain";
import { poolMembershipForContract } from "@/services/pool-service";

export const FINANCING_STAGE_IDS = [
  "dac",
  "scas",
  "matching",
  "pool",
  "coverage",
  "finance",
] as const;

export type FinancingStageId = (typeof FINANCING_STAGE_IDS)[number];

export interface FinancingStage {
  id: FinancingStageId;
  done: boolean;
}

export function isVerificationComplete(
  verification: ContractVerification,
): boolean {
  return Object.values(verification).every(
    (value) =>
      value === "VERIFIED" || value === "PASSED" || value === "CONFIRMED",
  );
}

export function monitoringWarningKeys(
  contract: DigitalAgriculturalContract,
): Array<"satellite" | "soilMoisture" | "insurance" | "status"> {
  const warnings: Array<"satellite" | "soilMoisture" | "insurance" | "status"> =
    [];
  if (contract.monitoring.satellite !== "HEALTHY") {
    warnings.push("satellite");
  }
  if (contract.monitoring.soilMoisture !== "NORMAL") {
    warnings.push("soilMoisture");
  }
  if (contract.insurance.status !== "ACTIVE") {
    warnings.push("insurance");
  }
  if (contract.status === "SUSPENDED") {
    warnings.push("status");
  }
  return warnings;
}

export function producerFinancingStages(
  contract: DigitalAgriculturalContract,
): FinancingStage[] {
  const membership = poolMembershipForContract(contract.id);
  return [
    { id: "dac", done: true },
    { id: "scas", done: isVerificationComplete(contract.verification) },
    {
      id: "matching",
      done:
        contract.status === "IN_POOL" || contract.status === "VERIFIED",
    },
    { id: "pool", done: Boolean(membership) },
    {
      id: "coverage",
      done: membership?.member.eligibility === "ELIGIBLE",
    },
    { id: "finance", done: false },
  ];
}

export function coverageBreachCount(status: CoverageStatus): number {
  return status === "BREACH" ? 1 : 0;
}

export function remainingCoverageCapacity(
  coverage: ContractCoverage,
  mintedSupply: number,
): number {
  return remainingIssuanceCapacity({
    eligibleCoverageTonnes: coverage.eligibleCoverageTonnes,
    outstandingTokens: mintedSupply,
    reservedTokens: 0,
  });
}

export function isComplianceAlert(record: ComplianceRecord): boolean {
  return (
    record.eligibility === "BLOCKED" ||
    record.sanctions === "HIT" ||
    record.walletOwnership === "FAILED"
  );
}
