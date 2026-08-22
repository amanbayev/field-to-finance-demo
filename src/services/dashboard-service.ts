import { dashboardMetrics } from "@/data/mock/system";
import type { DashboardMetrics } from "@/domain";
import type { NetworkStatus } from "@/adapters/blockchain";
import { getPlacementSnapshot } from "@/services/placement-service";
import { blockchainProvider } from "@/services/providers";

export interface DashboardSnapshot {
  metrics: DashboardMetrics;
  network: NetworkStatus;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [network, placement] = await Promise.all([
    blockchainProvider.getNetworkStatus(),
    getPlacementSnapshot(),
  ]);
  const minted = placement.supply.mintedSupply;
  return {
    metrics: {
      ...dashboardMetrics,
      tokenizedVolumeTonnes: minted,
      tokenIssuanceStarted: minted > 0,
      wheatMintedSupply: minted,
      primaryPlacementVolume: placement.supply.placed,
      registrarInventory: placement.supply.registrarInventory,
      circulatingSupply: placement.supply.circulating,
    },
    network,
  };
}
