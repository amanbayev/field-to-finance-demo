import {
  Connection,
  PublicKey,
  type AccountInfo,
  type ConfirmedSignatureInfo,
} from "@solana/web3.js";
import { getPublicEnv, solanaNetworkLabel } from "@/lib/public-env";
import {
  ON_CHAIN_DEMO_CONTRACT_IDS,
  ON_CHAIN_DEMO_POOL_ID,
} from "./config";
import {
  decodeAllocationAccount,
  decodeAllocationIndexAccount,
  decodeContractAccount,
  decodePoolAccount,
  deriveAllocationIndexPda,
  deriveAllocationPda,
  deriveContractPda,
  derivePoolPda,
} from "./codec";
import { recordedContractProof, recordedPoolProof } from "./recorded-proof";
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
  OnChainPoolContractsLookup,
  OnChainPoolLookup,
  WriteInstructionResult,
} from "../types";

const WRITE_DISABLED =
  "Administrative Solana writes run from development scripts, not the public application.";

const FETCH_MS = 8_000;
const CACHE_MS = 20_000;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

export class SolanaBlockchainProvider implements BlockchainProvider {
  private readonly lookupCache = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private connection(): Connection {
    const { solanaRpcUrl } = getPublicEnv();
    return new Connection(solanaRpcUrl, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
    });
  }

  private programId(): PublicKey {
    const { registryProgramId } = getPublicEnv();
    return new PublicKey(registryProgramId);
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.cached("network-status", async () => {
      const { solanaNetwork } = getPublicEnv();
      const network = solanaNetworkLabel(solanaNetwork);
      try {
        const connection = this.connection();
        const programId = this.programId();
        const contractPdas = ON_CHAIN_DEMO_CONTRACT_IDS.map((id) =>
          deriveContractPda(programId, id),
        );
        const [slot, accounts] = await Promise.all([
          withTimeout(connection.getSlot("confirmed"), FETCH_MS),
          this.getMultipleAccounts(connection, [programId, ...contractPdas]),
        ]);
        const programAccount = accounts[0];
        const registryProgramDeployed = Boolean(programAccount?.executable);
        const onChainDemoContracts = accounts
          .slice(1)
          .filter((account) => account?.owner.equals(programId)).length;
        return {
          network,
          connected: Number.isFinite(slot),
          blockchainDeployed: registryProgramDeployed,
          registryProgramDeployed,
          onChainDemoContracts,
        };
      } catch {
        return {
          network,
          connected: false,
          blockchainDeployed: false,
          registryProgramDeployed: false,
          onChainDemoContracts: 0,
        };
      }
    });
  }

  async getDigitalAgriculturalContract(
    contractId: string,
  ): Promise<OnChainContractLookup> {
    return this.cached(`contract:${contractId}`, async () => {
      try {
        const connection = this.connection();
        const programId = this.programId();
        const pda = deriveContractPda(programId, contractId);
        const [account] = await this.getMultipleAccounts(connection, [pda]);

        if (!account) {
          return { status: "missing" };
        }
        if (!account.owner.equals(programId)) {
          return { status: "unavailable" };
        }

        const contract = decodeContractAccount(
          Buffer.from(account.data),
          pda.toBase58(),
          programId.toBase58(),
        );

        const recorded = recordedContractProof[contractId] ?? {};
        const signatures = await this.resolveSignatures(
          connection,
          pda,
          recorded.createSignature,
          recorded.verifySignature,
        );

        return {
          status: "found",
          contract,
          createSignature: signatures.createSignature,
          verifySignature: signatures.verifySignature,
        };
      } catch {
        return { status: "unavailable" };
      }
    });
  }

  async getContractPool(poolId: string): Promise<OnChainPoolLookup> {
    return this.cached(`pool:${poolId}`, async () => {
      try {
        const connection = this.connection();
        const programId = this.programId();
        const pda = derivePoolPda(programId, poolId);
        const [account] = await this.getMultipleAccounts(connection, [pda]);
        if (!account) {
          return { status: "missing" };
        }
        if (!account.owner.equals(programId)) {
          return { status: "unavailable" };
        }

        const pool = decodePoolAccount(
          Buffer.from(account.data),
          pda.toBase58(),
          programId.toBase58(),
        );
        const recorded = recordedPoolProof[poolId] ?? {};
        return {
          status: "found",
          pool,
          createSignature: recorded.createSignature,
          coverageSignature: recorded.coverageSignature,
          activateSignature: recorded.activateSignature,
        };
      } catch {
        return { status: "unavailable" };
      }
    });
  }

  async getContractAllocation(
    contractId: string,
  ): Promise<OnChainAllocationLookup> {
    return this.cached(`allocation:${contractId}`, async () => {
      try {
        const connection = this.connection();
        const programId = this.programId();
        const contractPda = deriveContractPda(programId, contractId);
        const indexPda = deriveAllocationIndexPda(programId, contractId);
        const allocationPda = deriveAllocationPda(
          programId,
          contractId,
          ON_CHAIN_DEMO_POOL_ID,
        );

        const [contractAccount, indexAccount, allocationAccount] =
          await this.getMultipleAccounts(connection, [
            contractPda,
            indexPda,
            allocationPda,
          ]);

        if (!contractAccount) {
          return { status: "missing" };
        }
        if (!contractAccount.owner.equals(programId)) {
          return { status: "unavailable" };
        }

        const contract = decodeContractAccount(
          Buffer.from(contractAccount.data),
          contractPda.toBase58(),
          programId.toBase58(),
        );

        const index =
          indexAccount && indexAccount.owner.equals(programId)
            ? decodeAllocationIndexAccount(
                Buffer.from(indexAccount.data),
                indexPda.toBase58(),
                programId.toBase58(),
              )
            : undefined;
        const allocation =
          allocationAccount && allocationAccount.owner.equals(programId)
            ? decodeAllocationAccount(
                Buffer.from(allocationAccount.data),
                allocationPda.toBase58(),
                programId.toBase58(),
              )
            : undefined;

        const allocated = index?.allocatedVolumeTonnes ?? 0;
        const recorded = recordedContractProof[contractId] ?? {};

        return {
          status: "found",
          allocation,
          index,
          expectedVolumeTonnes: contract.expectedVolumeTonnes,
          remainingVolumeTonnes: Math.max(
            0,
            contract.expectedVolumeTonnes - allocated,
          ),
          allocateSignature: recorded.allocateSignature,
        };
      } catch {
        return { status: "unavailable" };
      }
    });
  }

  async getPoolContracts(
    poolId: string,
    contractIds: string[],
  ): Promise<OnChainPoolContractsLookup> {
    return this.cached(`pool-contracts:${poolId}:${contractIds.join(",")}`, async () => {
      try {
        const connection = this.connection();
        const programId = this.programId();
        const pdas = contractIds.map((contractId) =>
          deriveAllocationPda(programId, contractId, poolId),
        );
        const accounts = await this.getMultipleAccounts(connection, pdas);
        const allocations = accounts.flatMap((account, index) => {
          const pda = pdas[index];
          if (!account || !account.owner.equals(programId)) {
            return [];
          }
          try {
            return [
              decodeAllocationAccount(
                Buffer.from(account.data),
                pda.toBase58(),
                programId.toBase58(),
              ),
            ];
          } catch {
            return [];
          }
        });
        return {
          status: "found",
          allocations,
        };
      } catch {
        return { status: "unavailable", allocations: [] };
      }
    });
  }

  async getCoverageProof(poolId: string): Promise<OnChainCoverageProofLookup> {
    const lookup = await this.getContractPool(poolId);
    if (lookup.status !== "found" || !lookup.pool) {
      return {
        status: lookup.status,
        coverageModel: "off-chain",
        snapshotAnchored: false,
      };
    }
    const hash = lookup.pool.coverageSnapshotHash;
    const snapshotAnchored = hash.some((byte) => byte !== 0);
    return {
      status: "found",
      pool: lookup.pool,
      snapshotHashHex: lookup.pool.coverageSnapshotHashHex,
      coverageModel: "off-chain",
      snapshotAnchored,
    };
  }

  async createDigitalAgriculturalContract(
    request: CreateContractRequest,
  ): Promise<WriteInstructionResult> {
    return { accepted: false, reason: `${WRITE_DISABLED} (${request.contractId})` };
  }

  async verifyDigitalAgriculturalContract(
    contractId: string,
  ): Promise<WriteInstructionResult> {
    return { accepted: false, reason: `${WRITE_DISABLED} (${contractId})` };
  }

  async getTransaction(
    signature: string,
  ): Promise<BlockchainTransaction | null> {
    try {
      const connection = this.connection();
      const tx = await withTimeout(
        connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        }),
        FETCH_MS,
      );
      if (!tx) {
        return { id: signature, status: "NOT_AVAILABLE" };
      }
      return {
        id: signature,
        status: tx.meta?.err ? "FAILED" : "CONFIRMED",
        slot: tx.slot,
        timestamp: tx.blockTime
          ? new Date(tx.blockTime * 1000).toISOString()
          : undefined,
      };
    } catch {
      return { id: signature, status: "NOT_AVAILABLE" };
    }
  }

  issueToken(request: IssueTokenRequest): IssueTokenResult {
    return {
      accepted: false,
      reason: `Solana issuance will be activated in the next development phase. Token ${request.tokenId} was not submitted.`,
    };
  }

  private async getMultipleAccounts(
    connection: Connection,
    keys: PublicKey[],
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    if (keys.length === 0) {
      return [];
    }
    const accounts = await withTimeout(
      connection.getMultipleAccountsInfo(keys, "confirmed"),
      FETCH_MS,
    );
    return accounts;
  }

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.lookupCache.get(key);
    if (hit && hit.expires > now) {
      return hit.value as T;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
    const promise = fn()
      .then((value) => {
        this.lookupCache.set(key, { value, expires: Date.now() + CACHE_MS });
        this.inflight.delete(key);
        return value;
      })
      .catch((error: unknown) => {
        this.inflight.delete(key);
        throw error;
      });
    this.inflight.set(key, promise);
    return promise;
  }

  private async resolveSignatures(
    connection: Connection,
    pda: PublicKey,
    recordedCreate?: string,
    recordedVerify?: string,
  ): Promise<{ createSignature?: string; verifySignature?: string }> {
    if (recordedCreate && recordedVerify) {
      return {
        createSignature: recordedCreate,
        verifySignature: recordedVerify,
      };
    }

    try {
      const history = await withTimeout(
        connection.getSignaturesForAddress(pda, { limit: 20 }),
        FETCH_MS,
      );
      const confirmed = history.filter((item) => !item.err);
      const chronological = [...confirmed].reverse();
      const createSignature =
        recordedCreate ?? chronological[0]?.signature ?? undefined;
      const verifySignature =
        recordedVerify ?? pickVerifySignature(chronological, createSignature);
      return { createSignature, verifySignature };
    } catch {
      return {
        createSignature: recordedCreate,
        verifySignature: recordedVerify,
      };
    }
  }
}

function pickVerifySignature(
  chronological: ConfirmedSignatureInfo[],
  createSignature?: string,
): string | undefined {
  const later = chronological.filter((item) => item.signature !== createSignature);
  return later.at(-1)?.signature;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("rpc-timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
