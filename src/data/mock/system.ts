import type { DashboardMetrics, SystemOverview } from "@/domain";
import { money } from "@/domain/money";

export const dashboardMetrics: DashboardMetrics = {
  digitalContracts: 12,
  contractVolumeTonnes: 24800,
  eligibleCoverageTonnes: 19600,
  tokenizedVolumeTonnes: 8000,
  activeFinancing: money(620_000_000, "KZT"),
  averageCoverageRatioPercent: 122,
};

export const systemOverview: SystemOverview = {
  contracts: 12,
  pools: 1,
  tokenSeries: 1,
  participants: 8,
  blockedParticipants: 1,
  coverageAlerts: 0,
};
