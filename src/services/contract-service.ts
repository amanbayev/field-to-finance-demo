import { contracts } from "@/data/mock/contracts";
import { producers } from "@/data/mock/producers";
import type { DigitalAgriculturalContract, Producer } from "@/domain";

export interface ContractListItem {
  contract: DigitalAgriculturalContract;
  producer: Producer;
}

export function listContracts(): ContractListItem[] {
  return contracts.map((contract) => ({
    contract,
    producer: requireProducer(contract.producerId),
  }));
}

export function getContract(id: string): ContractListItem | undefined {
  const contract = contracts.find((item) => item.id === id);
  if (!contract) {
    return undefined;
  }

  return {
    contract,
    producer: requireProducer(contract.producerId),
  };
}

export function listContractIds(): string[] {
  return contracts.map((contract) => contract.id);
}

function requireProducer(producerId: string): Producer {
  const producer = producers.find((item) => item.id === producerId);
  if (!producer) {
    throw new Error(`Producer ${producerId} is missing from mock data.`);
  }
  return producer;
}
