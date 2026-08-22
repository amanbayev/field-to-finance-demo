import { dashboardMetrics } from "@/data/mock/system";
import { blockchainProvider } from "@/services/providers";
import type { DashboardMetrics } from "@/domain";
import {
  ON_CHAIN_DEMO_TOKEN_ID,
  type NetworkStatus,
} from "@/adapters/blockchain";
import { liveOutstanding } from "@/services/token-service";

export interface DashboardSnapshot {
  metrics: DashboardMetrics;
  network: NetworkStatus;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [network, mintLookup] = await Promise.all([
    blockchainProvider.getNetworkStatus(),
    blockchainProvider.getTokenMint(ON_CHAIN_DEMO_TOKEN_ID),
  ]);
  const issued = liveOutstanding(
    mintLookup,
    dashboardMetrics.tokenizedVolumeTonnes,
  );
  return {
    metrics: {
      ...dashboardMetrics,
      tokenizedVolumeTonnes: issued,
      tokenIssuanceStarted: issued > 0,
    },
    network,
  };
}
