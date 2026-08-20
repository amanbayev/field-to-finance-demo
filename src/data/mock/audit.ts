import type { AuditEvent } from "@/domain";

export const auditEvents: AuditEvent[] = [
  {
    id: "aud-001",
    timestamp: "2026-03-12T09:14:00.000Z",
    eventKey: "contractCreated",
    relatedEntityType: "contract",
    relatedEntityId: "DAC-2027-0001",
  },
  {
    id: "aud-002",
    timestamp: "2026-03-18T11:02:00.000Z",
    eventKey: "producerVerified",
    relatedEntityType: "participant",
    relatedEntityId: "prd-akmola-agro",
  },
  {
    id: "aud-003",
    timestamp: "2026-04-02T08:40:00.000Z",
    eventKey: "contractVerified",
    relatedEntityType: "contract",
    relatedEntityId: "DAC-2027-0001",
  },
  {
    id: "aud-004",
    timestamp: "2026-05-11T14:22:00.000Z",
    eventKey: "addedToPool",
    relatedEntityType: "pool",
    relatedEntityId: "POOL-WHEAT-2027-01",
  },
  {
    id: "aud-005",
    timestamp: "2026-05-12T10:05:00.000Z",
    eventKey: "riskCompleted",
    relatedEntityType: "pool",
    relatedEntityId: "POOL-WHEAT-2027-01",
  },
  {
    id: "aud-006",
    timestamp: "2026-05-12T10:18:00.000Z",
    eventKey: "coverageCalculated",
    relatedEntityType: "coverage",
    relatedEntityId: "POOL-WHEAT-2027-01",
  },
  {
    id: "aud-007",
    timestamp: "2026-06-01T09:00:00.000Z",
    eventKey: "tokenPrepared",
    relatedEntityType: "token",
    relatedEntityId: "tok-wheat-2027",
  },
];
