import { listContracts, type ContractListItem } from "@/services/contract-service";
import {
  actorCan,
  canReadProducerRecord,
  type ActorContext,
} from "@/domain/identity";

export function listContractsForActor(actor: ActorContext): ContractListItem[] {
  return listContracts().filter((item) =>
    canReadProducerRecord(actor, item.producer.id),
  );
}

export function getContractForActor(
  actor: ActorContext,
  contractId: string,
): ContractListItem | "forbidden" | undefined {
  const item = listContracts().find((entry) => entry.contract.id === contractId);
  if (!item) {
    return undefined;
  }
  if (!canReadProducerRecord(actor, item.producer.id)) {
    return "forbidden";
  }
  return item;
}

export function canOpenScas(actor: ActorContext): boolean {
  return actorCan(actor, "scas.read");
}
