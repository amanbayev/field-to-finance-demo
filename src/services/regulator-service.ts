import { auditEvents } from "@/data/mock/audit";
import { systemOverview } from "@/data/mock/system";
import { blockchainProvider } from "@/services/providers";
import {
  ON_CHAIN_DEMO_CONTRACT_IDS,
  ON_CHAIN_DEMO_POOL_ID,
} from "@/adapters/blockchain";
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
  const events: AuditEvent[] = [];
  const [contractLookups, poolLookup] = await Promise.all([
    Promise.all(
      ON_CHAIN_DEMO_CONTRACT_IDS.map((id) =>
        blockchainProvider.getDigitalAgriculturalContract(id),
      ),
    ),
    blockchainProvider.getContractPool(ON_CHAIN_DEMO_POOL_ID),
  ]);

  for (const [index, lookup] of contractLookups.entries()) {
    const contractId = ON_CHAIN_DEMO_CONTRACT_IDS[index];
    if (lookup.status !== "found" || !lookup.contract) {
      continue;
    }
    if (lookup.createSignature) {
      const tx = await blockchainProvider.getTransaction(lookup.createSignature);
      events.push({
        id: `sol-reg-${contractId}`,
        timestamp: tx?.timestamp ?? unixToIso(lookup.contract.createdAt),
        eventKey: "contractRegisteredOnChain",
        relatedEntityType: "contract",
        relatedEntityId: contractId,
        source: "blockchain",
        reference: lookup.createSignature,
      });
    }
    if (lookup.verifySignature) {
      const tx = await blockchainProvider.getTransaction(lookup.verifySignature);
      events.push({
        id: `sol-ver-${contractId}`,
        timestamp: tx?.timestamp ?? unixToIso(lookup.contract.updatedAt),
        eventKey: "contractVerifiedOnChain",
        relatedEntityType: "contract",
        relatedEntityId: contractId,
        source: "blockchain",
        reference: lookup.verifySignature,
      });
    }
  }

  if (poolLookup.status === "found" && poolLookup.pool) {
    if (poolLookup.createSignature) {
      const tx = await blockchainProvider.getTransaction(
        poolLookup.createSignature,
      );
      events.push({
        id: `sol-pool-${ON_CHAIN_DEMO_POOL_ID}`,
        timestamp: tx?.timestamp ?? unixToIso(poolLookup.pool.createdAt),
        eventKey: "poolCreatedOnChain",
        relatedEntityType: "pool",
        relatedEntityId: ON_CHAIN_DEMO_POOL_ID,
        source: "blockchain",
        reference: poolLookup.createSignature,
      });
    }
    if (poolLookup.coverageSignature) {
      const tx = await blockchainProvider.getTransaction(
        poolLookup.coverageSignature,
      );
      events.push({
        id: `sol-cov-${ON_CHAIN_DEMO_POOL_ID}`,
        timestamp: tx?.timestamp ?? unixToIso(poolLookup.pool.updatedAt),
        eventKey: "coverageSnapshotAnchored",
        relatedEntityType: "pool",
        relatedEntityId: ON_CHAIN_DEMO_POOL_ID,
        source: "blockchain",
        reference: poolLookup.coverageSignature,
      });
    }
  }

  const allocations = await Promise.all(
    ON_CHAIN_DEMO_CONTRACT_IDS.map((id) =>
      blockchainProvider.getContractAllocation(id),
    ),
  );
  for (const [index, lookup] of allocations.entries()) {
    const contractId = ON_CHAIN_DEMO_CONTRACT_IDS[index];
    if (lookup.status !== "found" || !lookup.allocateSignature) {
      continue;
    }
    const tx = await blockchainProvider.getTransaction(lookup.allocateSignature);
    events.push({
      id: `sol-alloc-${contractId}`,
      timestamp:
        tx?.timestamp ??
        (lookup.allocation ? unixToIso(lookup.allocation.createdAt) : new Date(0).toISOString()),
      eventKey: "contractAllocatedOnChain",
      relatedEntityType: "contract",
      relatedEntityId: contractId,
      source: "blockchain",
      reference: lookup.allocateSignature,
    });
  }

  return events;
}

function unixToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}
