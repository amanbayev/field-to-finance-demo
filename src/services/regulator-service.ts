import { auditEvents } from "@/data/mock/audit";
import { systemOverview } from "@/data/mock/system";
import { blockchainProvider } from "@/services/providers";
import {
  ON_CHAIN_DEMO_CONTRACT_IDS,
  ON_CHAIN_DEMO_POOL_ID,
  ON_CHAIN_DEMO_TOKEN_ID,
} from "@/adapters/blockchain";
import type {
  OnChainAllocationLookup,
  OnChainContractLookup,
  OnChainPoolLookup,
  OnChainTokenMintLookup,
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
  const local = auditEvents.filter(
    (event) =>
      event.relatedEntityType === "contract" &&
      event.relatedEntityId === contractId,
  );
  const [lookup, allocation] = await Promise.all([
    blockchainProvider.getDigitalAgriculturalContract(contractId),
    blockchainProvider.getContractAllocation(contractId),
  ]);
  const chain = eventsForContract(contractId, lookup, allocation);
  return [...local, ...chain].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

async function listBlockchainAuditEvents(): Promise<AuditEvent[]> {
  const [contractLookups, poolLookup, allocations, mintLookup] = await Promise.all([
    Promise.all(
      ON_CHAIN_DEMO_CONTRACT_IDS.map((id) =>
        blockchainProvider.getDigitalAgriculturalContract(id),
      ),
    ),
    blockchainProvider.getContractPool(ON_CHAIN_DEMO_POOL_ID),
    Promise.all(
      ON_CHAIN_DEMO_CONTRACT_IDS.map((id) =>
        blockchainProvider.getContractAllocation(id),
      ),
    ),
    blockchainProvider.getTokenMint(ON_CHAIN_DEMO_TOKEN_ID),
  ]);

  const events: AuditEvent[] = [];
  for (const [index, lookup] of contractLookups.entries()) {
    const contractId = ON_CHAIN_DEMO_CONTRACT_IDS[index];
    events.push(
      ...eventsForContract(contractId, lookup, allocations[index]),
    );
  }
  events.push(...eventsForPool(poolLookup));
  events.push(...(await eventsForToken(mintLookup)));
  return events;
}

function eventsForContract(
  contractId: string,
  lookup: OnChainContractLookup,
  allocation?: OnChainAllocationLookup,
): AuditEvent[] {
  const events: AuditEvent[] = [];
  if (lookup.status === "found" && lookup.contract) {
    if (lookup.createSignature) {
      events.push({
        id: `sol-reg-${contractId}`,
        timestamp: unixToIso(lookup.contract.createdAt),
        eventKey: "contractRegisteredOnChain",
        relatedEntityType: "contract",
        relatedEntityId: contractId,
        source: "blockchain",
        reference: lookup.createSignature,
      });
    }
    if (lookup.verifySignature) {
      events.push({
        id: `sol-ver-${contractId}`,
        timestamp: unixToIso(lookup.contract.updatedAt),
        eventKey: "contractVerifiedOnChain",
        relatedEntityType: "contract",
        relatedEntityId: contractId,
        source: "blockchain",
        reference: lookup.verifySignature,
      });
    }
  }
  if (allocation?.status === "found" && allocation.allocateSignature) {
    events.push({
      id: `sol-alloc-${contractId}`,
      timestamp: allocation.allocation
        ? unixToIso(allocation.allocation.createdAt)
        : lookup.contract
          ? unixToIso(lookup.contract.updatedAt)
          : new Date().toISOString(),
      eventKey: "contractAllocatedOnChain",
      relatedEntityType: "contract",
      relatedEntityId: contractId,
      source: "blockchain",
      reference: allocation.allocateSignature,
    });
  }
  return events;
}

function eventsForPool(poolLookup: OnChainPoolLookup): AuditEvent[] {
  if (poolLookup.status !== "found" || !poolLookup.pool) {
    return [];
  }
  const events: AuditEvent[] = [];
  if (poolLookup.createSignature) {
    events.push({
      id: `sol-pool-${ON_CHAIN_DEMO_POOL_ID}`,
      timestamp: unixToIso(poolLookup.pool.createdAt),
      eventKey: "poolCreatedOnChain",
      relatedEntityType: "pool",
      relatedEntityId: ON_CHAIN_DEMO_POOL_ID,
      source: "blockchain",
      reference: poolLookup.createSignature,
    });
  }
  if (poolLookup.coverageSignature) {
    events.push({
      id: `sol-cov-${ON_CHAIN_DEMO_POOL_ID}`,
      timestamp: unixToIso(poolLookup.pool.updatedAt),
      eventKey: "coverageSnapshotAnchored",
      relatedEntityType: "pool",
      relatedEntityId: ON_CHAIN_DEMO_POOL_ID,
      source: "blockchain",
      reference: poolLookup.coverageSignature,
    });
  }
  return events;
}

function unixToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

async function eventsForToken(
  lookup: OnChainTokenMintLookup,
): Promise<AuditEvent[]> {
  if (lookup.status !== "found" || !lookup.mintToSignature) {
    return [];
  }
  const tx = await blockchainProvider.getTransaction(lookup.mintToSignature);
  return [
    {
      id: `sol-mint-${ON_CHAIN_DEMO_TOKEN_ID}`,
      timestamp: tx?.timestamp ?? new Date().toISOString(),
      eventKey: "tokenMintedOnChain",
      relatedEntityType: "token",
      relatedEntityId: ON_CHAIN_DEMO_TOKEN_ID,
      source: "blockchain",
      reference: lookup.mintToSignature,
    },
  ];
}
