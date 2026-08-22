import type { ContractCoverage } from "@/domain";
import {
  haircutPercentFromBps,
  percentFromBps,
  phase2WheatPoolCoverage,
} from "@/domain/coverage-engine";
import { tokens } from "./tokens";

export function wheatPoolCoverageFromEngine(): ContractCoverage {
  const { snapshot, snapshotHashHex } = phase2WheatPoolCoverage();
  const outstandingTokens = tokens[0]?.issued ?? 0;
  return {
    poolId: snapshot.poolId,
    grossVolumeTonnes: snapshot.grossVolumeTonnes,
    adjustments: snapshot.riskAdjustments.map((adjustment) => ({
      key: adjustment.key,
      label: adjustment.label,
      percentagePoints: percentFromBps(adjustment.basisPoints),
      basisPoints: adjustment.basisPoints,
      source: adjustment.source,
      status: adjustment.status,
      lastUpdated: adjustment.lastUpdated,
      evidenceReference: adjustment.evidenceReference,
    })),
    totalHaircutPercent: haircutPercentFromBps(snapshot.totalHaircutBps),
    totalHaircutBps: snapshot.totalHaircutBps,
    eligibleCoverageTonnes: snapshot.eligibleVolumeTonnes,
    maximumTokenIssuance: snapshot.eligibleVolumeTonnes,
    outstandingTokens,
    coverageRatioPercent: null,
    tokenIssuanceStarted: outstandingTokens > 0,
    snapshotHashHex,
    snapshotVersion: snapshot.version,
    calculatedAt: snapshot.calculatedAt,
    status: "HEALTHY",
  };
}
