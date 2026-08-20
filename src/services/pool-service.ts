import { pools } from "@/data/mock/pools";
import { contracts } from "@/data/mock/contracts";
import { producers } from "@/data/mock/producers";
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
  eligibility: EligibilityStatus;
}

export interface PoolDetail {
  pool: ContractPool;
  members: PoolMemberRow[];
  producerCount: number;
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

export function listPoolIds(): string[] {
  return pools.map((pool) => pool.id);
}
