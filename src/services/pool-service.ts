import { pools } from "@/data/mock/pools";
import { contracts } from "@/data/mock/contracts";
import { producers } from "@/data/mock/producers";
import { blockchainProvider } from "@/services/providers";
import type {
  OnChainCoverageProofLookup,
  OnChainPoolContractsLookup,
  OnChainPoolLookup,
} from "@/adapters/blockchain";
import type {
  ContractPool,
  DigitalAgriculturalContract,
  EligibilityStatus,
  Producer,
} from "@/domain";

export interface PoolMemberRow {
  producer: Producer;
  contract: DigitalAgriculturalContract;
  volumeTonnes: number;
  allocatedVolumeTonnes?: number;
  eligibility: EligibilityStatus;
}

export interface PoolDetail {
  pool: ContractPool;
  members: PoolMemberRow[];
  producerCount: number;
}

export interface PoolSnapshot {
  detail: PoolDetail;
  onChainPool: OnChainPoolLookup;
  poolContracts: OnChainPoolContractsLookup;
  coverageProof: OnChainCoverageProofLookup;
}

export function listPools(): ContractPool[] {
  return pools;
}

export function getPool(id: string): PoolDetail | undefined {
  const pool = pools.find((item) => item.id === id);
  if (!pool) {
    return undefined;
  }

  const members = pool.members.map((member) => {
    const contract = contracts.find((item) => item.id === member.contractId);
    if (!contract) {
      throw new Error(`Pool member contract ${member.contractId} is missing.`);
    }
    const producer = producers.find((item) => item.id === contract.producerId);
    if (!producer) {
      throw new Error(`Producer ${contract.producerId} is missing.`);
    }
    return {
      producer,
      contract,
      volumeTonnes: member.volumeTonnes,
      eligibility: member.eligibility,
    };
  });

  const producerCount = new Set(members.map((member) => member.producer.id))
    .size;

  return { pool, members, producerCount };
}

export async function getPoolSnapshot(
  id: string,
): Promise<PoolSnapshot | undefined> {
  const detail = getPool(id);
  if (!detail) {
    return undefined;
  }

  const [onChainPool, poolContracts, coverageProof] = await Promise.all([
    blockchainProvider.getContractPool(id),
    blockchainProvider.getPoolContracts(
      id,
      detail.pool.contractIds,
    ),
    blockchainProvider.getCoverageProof(id),
  ]);

  const allocatedByContract = new Map(
    poolContracts.allocations.map((item) => [
      item.contractId,
      item.allocatedVolumeTonnes,
    ]),
  );

  return {
    detail: {
      ...detail,
      members: detail.members.map((member) => ({
        ...member,
        allocatedVolumeTonnes: allocatedByContract.get(member.contract.id),
      })),
    },
    onChainPool,
    poolContracts,
    coverageProof,
  };
}

export function listPoolIds(): string[] {
  return pools.map((pool) => pool.id);
}

