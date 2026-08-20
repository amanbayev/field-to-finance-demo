export interface NetworkStatus {
  network: string;
  connected: boolean;
  blockchainDeployed: boolean;
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
}

export interface BlockchainProvider {
  getNetworkStatus(): NetworkStatus;
  issueToken(request: IssueTokenRequest): IssueTokenResult;
  getTransaction(id: string): BlockchainTransaction | null;
}
