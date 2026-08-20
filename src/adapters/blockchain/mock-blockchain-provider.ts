import { getPublicEnv, solanaNetworkLabel } from "@/lib/public-env";
import type {
  BlockchainProvider,
  BlockchainTransaction,
  IssueTokenRequest,
  IssueTokenResult,
  NetworkStatus,
} from "./types";

export class MockBlockchainProvider implements BlockchainProvider {
  getNetworkStatus(): NetworkStatus {
    const { solanaNetwork } = getPublicEnv();
    return {
      network: solanaNetworkLabel(solanaNetwork),
      connected: true,
      blockchainDeployed: false,
    };
  }

  issueToken(request: IssueTokenRequest): IssueTokenResult {
    return {
      accepted: false,
      reason: `Solana issuance will be activated in the next development phase. Token ${request.tokenId} was not submitted.`,
    };
  }

  getTransaction(id: string): BlockchainTransaction | null {
    return {
      id,
      status: "NOT_AVAILABLE",
    };
  }
}
