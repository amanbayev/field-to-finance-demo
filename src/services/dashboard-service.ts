import { dashboardMetrics } from "@/data/mock/system";
import { blockchainProvider } from "@/services/providers";
import type { DashboardMetrics } from "@/domain";
import type { NetworkStatus } from "@/adapters/blockchain";

export interface DashboardSnapshot {
  metrics: DashboardMetrics;
  network: NetworkStatus;
}

export function getDashboardSnapshot(): DashboardSnapshot {
  return {
    metrics: dashboardMetrics,
    network: blockchainProvider.getNetworkStatus(),
  };
}
