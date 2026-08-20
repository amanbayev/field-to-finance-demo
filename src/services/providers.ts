import { MockBlockchainProvider } from "@/adapters/blockchain";
import {
  MockKybProvider,
  MockKycProvider,
  MockKytProvider,
} from "@/adapters/compliance";
import { fxProvider } from "@/adapters/fx";
import type { BlockchainProvider } from "@/adapters/blockchain";
import type {
  KybProvider,
  KycProvider,
  KytProvider,
} from "@/adapters/compliance";
import type { FxProvider } from "@/adapters/fx";

export const blockchainProvider: BlockchainProvider =
  new MockBlockchainProvider();

export const kycProvider: KycProvider = new MockKycProvider();
export const kybProvider: KybProvider = new MockKybProvider();
export const kytProvider: KytProvider = new MockKytProvider();
export { fxProvider };
export type { FxProvider };
