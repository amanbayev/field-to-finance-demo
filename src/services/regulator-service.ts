import { auditEvents } from "@/data/mock/audit";
import { systemOverview } from "@/data/mock/system";
import { blockchainProvider } from "@/services/providers";
import { ON_CHAIN_DEMO_CONTRACT_ID } from "@/adapters/blockchain";
import type { AuditEvent, SystemOverview } from "@/domain";

export function getSystemOverview(): SystemOverview {
  return systemOverview;
}

export function listAuditEvents(): AuditEvent[] {
  return auditEvents;
}

export async function listLedgerEvents(): Promise<AuditEvent[]> {
  const chain = await listBlockchainAuditEvents();
  return [...auditEvents, ...chain].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

export async function listLedgerEventsForContract(
  contractId: string,
): Promise<AuditEvent[]> {
  const events = await listLedgerEvents();
  return events.filter(
    (event) =>
      event.relatedEntityType === "contract" &&
      event.relatedEntityId === contractId,
  );
}

async function listBlockchainAuditEvents(): Promise<AuditEvent[]> {
  const lookup = await blockchainProvider.getDigitalAgriculturalContract(
    ON_CHAIN_DEMO_CONTRACT_ID,
  );
  if (lookup.status !== "found" || !lookup.contract) {
    return [];
  }

  const events: AuditEvent[] = [];
  if (lookup.createSignature) {
    const tx = await blockchainProvider.getTransaction(lookup.createSignature);
    events.push({
      id: "sol-reg-dac-2027-0001",
      timestamp: tx?.timestamp ?? unixToIso(lookup.contract.createdAt),
      eventKey: "contractRegisteredOnChain",
      relatedEntityType: "contract",
      relatedEntityId: ON_CHAIN_DEMO_CONTRACT_ID,
      source: "blockchain",
      reference: lookup.createSignature,
    });
  }
  if (lookup.verifySignature) {
    const tx = await blockchainProvider.getTransaction(lookup.verifySignature);
    events.push({
      id: "sol-ver-dac-2027-0001",
      timestamp: tx?.timestamp ?? unixToIso(lookup.contract.updatedAt),
      eventKey: "contractVerifiedOnChain",
      relatedEntityType: "contract",
      relatedEntityId: ON_CHAIN_DEMO_CONTRACT_ID,
      source: "blockchain",
      reference: lookup.verifySignature,
    });
  }
  return events;
}

function unixToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}
