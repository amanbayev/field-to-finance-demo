import { dashboardMetrics } from "@/data/mock/system";
import { blockchainProvider } from "@/services/providers";
import type { DashboardMetrics } from "@/domain";
import type { NetworkStatus } from "@/adapters/blockchain";

export interface DashboardSnapshot {
  metrics: DashboardMetrics;
  network: NetworkStatus;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return {
    metrics: dashboardMetrics,
    network: await blockchainProvider.getNetworkStatus(),
  };
}
