import { MockBlockchainProvider } from "@/adapters/blockchain";
import {
  MockKybProvider,
  MockKycProvider,
  MockKytProvider,
} from "@/adapters/compliance";
import { fxProvider } from "@/adapters/fx";
import { getPublicEnv } from "@/lib/public-env";
import type { BlockchainProvider } from "@/adapters/blockchain";
import type {
  KybProvider,
  KycProvider,
  KytProvider,
} from "@/adapters/compliance";
import type { FxProvider } from "@/adapters/fx";

/**
 * Phase 0.2 always uses MockBlockchainProvider.
 * `NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=solana` is reserved for Phase 1 and must
 * not take the public demo down if set early or if Solana env vars are absent.
 */
function createBlockchainProvider(): BlockchainProvider {
  const { blockchainProvider: name } = getPublicEnv();

  switch (name) {
    case "solana":
      return new MockBlockchainProvider();
    case "mock":
    default:
      return new MockBlockchainProvider();
  }
}

export const blockchainProvider: BlockchainProvider =
  createBlockchainProvider();

export const kycProvider: KycProvider = new MockKycProvider();
export const kybProvider: KybProvider = new MockKybProvider();
export const kytProvider: KytProvider = new MockKytProvider();
export { fxProvider };
export type { FxProvider };
