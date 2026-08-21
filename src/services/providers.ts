import { MockBlockchainProvider, SolanaBlockchainProvider } from "@/adapters/blockchain";
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

function createBlockchainProvider(): BlockchainProvider {
  const { blockchainProvider: name } = getPublicEnv();

  switch (name) {
    case "solana":
      return new SolanaBlockchainProvider();
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
