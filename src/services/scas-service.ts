import { participants } from "@/data/mock/participants";
import { wheatPool2027 } from "@/data/mock/pools";
import { producers } from "@/data/mock/producers";
import type { ScasAttestation, ScasBid, ScasListing } from "@/domain";
import { listContracts, type ContractListItem } from "./contract-service";
import { scasProvider } from "./providers";

const LOCKED_CONTRACT_IDS = new Set(wheatPool2027.contractIds);

export interface ScasSnapshot {
  operatorLabel: string;
  attestations: ScasAttestation[];
  listings: ScasListing[];
  bids: ScasBid[];
  pendingCount: number;
  attestedCount: number;
  lockedContracts: ContractListItem[];
}

export function scasPartyName(partyId: string): string {
  const producer = producers.find((item) => item.id === partyId);
  if (producer) {
    return producer.legalName;
  }
  const participant = participants.find((item) => item.id === partyId);
  if (participant) {
    return participant.name;
  }
  return partyId;
}

export function getScasSnapshot(): ScasSnapshot {
  const attestations = scasProvider.listAttestations();
  const lockedContracts = listContracts().filter((row) =>
    LOCKED_CONTRACT_IDS.has(row.contract.id),
  );

  return {
    operatorLabel: scasProvider.getOperatorLabel(),
    attestations,
    listings: scasProvider.listListings(),
    bids: scasProvider.listBids(),
    pendingCount: attestations.filter(
      (item) => item.status === "PENDING_ATTESTATION",
    ).length,
    attestedCount: attestations.filter((item) => item.status === "ATTESTED")
      .length,
    lockedContracts,
  };
}
