import { getPublicEnv, solanaNetworkLabel } from "@/lib/public-env";
import type {
  BlockchainProvider,
  BlockchainTransaction,
  CreateContractRequest,
  IssueTokenRequest,
  IssueTokenResult,
  NetworkStatus,
  OnChainContractLookup,
  WriteInstructionResult,
} from "./types";

const WRITE_DISABLED =
  "Administrative Solana writes run from development scripts, not the public application.";

export class MockBlockchainProvider implements BlockchainProvider {
  async getNetworkStatus(): Promise<NetworkStatus> {
    const { solanaNetwork } = getPublicEnv();
    return {
      network: solanaNetworkLabel(solanaNetwork),
      connected: true,
      blockchainDeployed: false,
      registryProgramDeployed: false,
      onChainDemoContracts: 0,
    };
  }

  async getDigitalAgriculturalContract(
    contractId: string,
  ): Promise<OnChainContractLookup> {
    void contractId;
    return { status: "missing" };
  }

  async createDigitalAgriculturalContract(
    request: CreateContractRequest,
  ): Promise<WriteInstructionResult> {
    return {
      accepted: false,
      reason: `${WRITE_DISABLED} (${request.contractId})`,
    };
  }

  async verifyDigitalAgriculturalContract(
    contractId: string,
  ): Promise<WriteInstructionResult> {
    return { accepted: false, reason: `${WRITE_DISABLED} (${contractId})` };
  }

  async getTransaction(id: string): Promise<BlockchainTransaction | null> {
    return {
      id,
      status: "NOT_AVAILABLE",
    };
  }

  issueToken(request: IssueTokenRequest): IssueTokenResult {
    return {
      accepted: false,
      reason: `Solana issuance will be activated in the next development phase. Token ${request.tokenId} was not submitted.`,
    };
  }
}
