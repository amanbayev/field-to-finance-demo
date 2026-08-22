import type { DashboardMetrics, SystemOverview } from "@/domain";
import { money } from "@/domain/money";
import { phase2WheatPoolCoverage } from "@/domain/coverage-engine";

const wheatCoverage = phase2WheatPoolCoverage().snapshot;

export const dashboardMetrics: DashboardMetrics = {
  digitalContracts: 12,
  verifiedOnChainContracts: 4,
  contractPools: 1,
  contractVolumeTonnes: 24800,
  grossPoolVolumeTonnes: wheatCoverage.grossVolumeTonnes,
  eligibleCoverageTonnes: wheatCoverage.eligibleVolumeTonnes,
  tokenizedVolumeTonnes: 1000,
  tokenIssuanceStarted: true,
  activeFinancing: money(620_000_000, "KZT"),
  averageCoverageRatioPercent: null,
};

export const systemOverview: SystemOverview = {
  contracts: 12,
  pools: 1,
  tokenSeries: 1,
  participants: 8,
  blockedParticipants: 1,
  coverageAlerts: 0,
};
