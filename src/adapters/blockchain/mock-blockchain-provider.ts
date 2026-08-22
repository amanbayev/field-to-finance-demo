import { getPublicEnv, solanaNetworkLabel } from "@/lib/public-env";
import type {
  BlockchainProvider,
  BlockchainTransaction,
  CreateContractRequest,
  IssueTokenRequest,
  IssueTokenResult,
  NetworkStatus,
  OnChainAllocationLookup,
  OnChainContractLookup,
  OnChainCoverageProofLookup,
  OnChainPlacementLookup,
  OnChainPoolContractsLookup,
  OnChainPoolLookup,
  OnChainTokenBalanceLookup,
  OnChainTokenMintLookup,
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
      marketProgramDeployed: false,
      onChainDemoContracts: 0,
    };
  }

  async getDigitalAgriculturalContract(
    contractId: string,
  ): Promise<OnChainContractLookup> {
    void contractId;
    return { status: "missing" };
  }

  async getContractPool(poolId: string): Promise<OnChainPoolLookup> {
    void poolId;
    return { status: "missing" };
  }

  async getContractAllocation(
    contractId: string,
  ): Promise<OnChainAllocationLookup> {
    void contractId;
    return { status: "missing" };
  }

  async getPoolContracts(
    poolId: string,
    contractIds: string[],
  ): Promise<OnChainPoolContractsLookup> {
    void poolId;
    void contractIds;
    return { status: "missing", allocations: [] };
  }

  async getCoverageProof(poolId: string): Promise<OnChainCoverageProofLookup> {
    void poolId;
    return {
      status: "missing",
      coverageModel: "off-chain",
      snapshotAnchored: false,
    };
  }

  async getTokenMint(tokenId: string): Promise<OnChainTokenMintLookup> {
    void tokenId;
    return { status: "missing" };
  }

  async getTokenAccountBalance(
    address: string,
  ): Promise<OnChainTokenBalanceLookup> {
    return { status: "missing", address };
  }

  async getPrimaryPlacement(
    placementId: string,
  ): Promise<OnChainPlacementLookup> {
    void placementId;
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
      reason: `${WRITE_DISABLED} Token ${request.tokenId} was not minted.`,
    };
  }
}
