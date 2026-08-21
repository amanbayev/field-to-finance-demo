export interface NetworkStatus {
  network: string;
  connected: boolean;
  blockchainDeployed: boolean;
  registryProgramDeployed: boolean;
  onChainDemoContracts: number;
}

export interface IssueTokenRequest {
  tokenId: string;
  amount: number;
}

export interface IssueTokenResult {
  accepted: boolean;
  reason: string;
}

export type TransactionStatus =
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"
  | "NOT_AVAILABLE";

export interface BlockchainTransaction {
  id: string;
  status: TransactionStatus;
  slot?: number;
  timestamp?: string;
}

export type OnChainLookupStatus = "found" | "missing" | "unavailable";

export interface OnChainContractLookup {
  status: OnChainLookupStatus;
  contract?: import("./solana/codec").OnChainDigitalAgriculturalContract;
  createSignature?: string;
  verifySignature?: string;
}

export interface OnChainPoolLookup {
  status: OnChainLookupStatus;
  pool?: import("./solana/codec").OnChainContractPool;
  createSignature?: string;
  coverageSignature?: string;
  activateSignature?: string;
}

export interface OnChainAllocationLookup {
  status: OnChainLookupStatus;
  allocation?: import("./solana/codec").OnChainContractAllocation;
  index?: import("./solana/codec").OnChainAllocationIndex;
  remainingVolumeTonnes?: number;
  expectedVolumeTonnes?: number;
  allocateSignature?: string;
}

export interface OnChainPoolContractsLookup {
  status: OnChainLookupStatus;
  allocations: import("./solana/codec").OnChainContractAllocation[];
}

export interface OnChainCoverageProofLookup {
  status: OnChainLookupStatus;
  pool?: import("./solana/codec").OnChainContractPool;
  snapshotHashHex?: string;
  coverageModel: "off-chain";
  snapshotAnchored: boolean;
}

export interface CreateContractRequest {
  contractId: string;
  producerReference: string;
  crop: string;
  season: number;
  fieldAreaHectares: number;
  expectedVolumeTonnes: number;
  qualityClass: string;
  region: string;
}

export interface WriteInstructionResult {
  accepted: boolean;
  reason: string;
  signature?: string;
}

export interface BlockchainProvider {
  getNetworkStatus(): Promise<NetworkStatus>;
  getDigitalAgriculturalContract(
    contractId: string,
  ): Promise<OnChainContractLookup>;
  getContractPool(poolId: string): Promise<OnChainPoolLookup>;
  getContractAllocation(contractId: string): Promise<OnChainAllocationLookup>;
  getPoolContracts(
    poolId: string,
    contractIds: string[],
  ): Promise<OnChainPoolContractsLookup>;
  getCoverageProof(poolId: string): Promise<OnChainCoverageProofLookup>;
  createDigitalAgriculturalContract(
    request: CreateContractRequest,
  ): Promise<WriteInstructionResult>;
  verifyDigitalAgriculturalContract(
    contractId: string,
  ): Promise<WriteInstructionResult>;
  getTransaction(signature: string): Promise<BlockchainTransaction | null>;
  issueToken(request: IssueTokenRequest): IssueTokenResult;
}
