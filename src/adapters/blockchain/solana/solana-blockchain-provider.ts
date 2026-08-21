import {
  Connection,
  PublicKey,
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

export class SolanaBlockchainProvider implements BlockchainProvider {
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
    const { solanaNetwork } = getPublicEnv();
    const network = solanaNetworkLabel(solanaNetwork);
    try {
      const connection = this.connection();
      const programId = this.programId();
      const lookups = await Promise.all([
        withTimeout(connection.getSlot("confirmed"), FETCH_MS),
        withTimeout(connection.getAccountInfo(programId, "confirmed"), FETCH_MS),
        ...ON_CHAIN_DEMO_CONTRACT_IDS.map((id) =>
          this.getDigitalAgriculturalContract(id),
        ),
      ]);
      const slot = lookups[0] as number;
      const programAccount = lookups[1] as Awaited<
        ReturnType<Connection["getAccountInfo"]>
      >;
      const demos = lookups.slice(2) as OnChainContractLookup[];
      const registryProgramDeployed = Boolean(programAccount?.executable);
      return {
        network,
        connected: Number.isFinite(slot),
        blockchainDeployed: registryProgramDeployed,
        registryProgramDeployed,
        onChainDemoContracts: demos.filter((item) => item.status === "found")
          .length,
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
  }

  async getDigitalAgriculturalContract(
    contractId: string,
  ): Promise<OnChainContractLookup> {
    try {
      const connection = this.connection();
      const programId = this.programId();
      const pda = deriveContractPda(programId, contractId);
      const account = await withTimeout(
        connection.getAccountInfo(pda, "confirmed"),
        FETCH_MS,
      );

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
  }

  async getContractPool(poolId: string): Promise<OnChainPoolLookup> {
    try {
      const connection = this.connection();
      const programId = this.programId();
      const pda = derivePoolPda(programId, poolId);
      const account = await withTimeout(
        connection.getAccountInfo(pda, "confirmed"),
        FETCH_MS,
      );
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
  }

  async getContractAllocation(
    contractId: string,
  ): Promise<OnChainAllocationLookup> {
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
        await Promise.all([
          withTimeout(connection.getAccountInfo(contractPda, "confirmed"), FETCH_MS),
          withTimeout(connection.getAccountInfo(indexPda, "confirmed"), FETCH_MS),
          withTimeout(
            connection.getAccountInfo(allocationPda, "confirmed"),
            FETCH_MS,
          ),
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
  }

  async getPoolContracts(
    poolId: string,
    contractIds: string[],
  ): Promise<OnChainPoolContractsLookup> {
    try {
      const connection = this.connection();
      const programId = this.programId();
      const accounts = await Promise.all(
        contractIds.map(async (contractId) => {
          const pda = deriveAllocationPda(programId, contractId, poolId);
          const account = await withTimeout(
            connection.getAccountInfo(pda, "confirmed"),
            FETCH_MS,
          );
          if (!account || !account.owner.equals(programId)) {
            return null;
          }
          return decodeAllocationAccount(
            Buffer.from(account.data),
            pda.toBase58(),
            programId.toBase58(),
          );
        }),
      );
      return {
        status: "found",
        allocations: accounts.filter(
          (item): item is NonNullable<typeof item> => item !== null,
        ),
      };
    } catch {
      return { status: "unavailable", allocations: [] };
    }
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
        recordedVerify ??
        pickVerifySignature(chronological, createSignature);
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
