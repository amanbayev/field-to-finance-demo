import type { ScasAttestation } from "@/domain";

export const scasOperatorLabel = "Demo SCAS Operator";

export const scasAttestations: ScasAttestation[] = [
  {
    id: "ATT-2026-041",
    kind: "poolLock",
    subjectType: "pool",
    subjectId: "POOL-WHEAT-2027-01",
    status: "ATTESTED",
    evidenceKey: "poolLockWheat",
    attestedAt: "2026-05-11T14:22:00.000Z",
  },
  {
    id: "ATT-2026-042",
    kind: "coverageSnapshot",
    subjectType: "pool",
    subjectId: "POOL-WHEAT-2027-01",
    status: "ATTESTED",
    evidenceKey: "coverageSnapshotWheat",
    attestedAt: "2026-05-12T10:18:00.000Z",
  },
  {
    id: "ATT-2026-043",
    kind: "producerScore",
    subjectType: "producer",
    subjectId: "prd-akmola-agro",
    status: "ATTESTED",
    evidenceKey: "producerScoreAttested",
    attestedAt: "2026-06-01T09:00:00.000Z",
  },
  {
    id: "ATT-2026-101",
    kind: "fieldContour",
    subjectType: "contract",
    subjectId: "DAC-2027-0005",
    status: "PENDING_ATTESTATION",
    evidenceKey: "fieldNotInPool",
  },
  {
    id: "ATT-2026-102",
    kind: "satellite",
    subjectType: "contract",
    subjectId: "DAC-2027-0007",
    status: "PENDING_ATTESTATION",
    evidenceKey: "satelliteWatch",
  },
  {
    id: "ATT-2026-103",
    kind: "satellite",
    subjectType: "contract",
    subjectId: "DAC-2027-0011",
    status: "PENDING_ATTESTATION",
    evidenceKey: "satelliteAlert",
  },
];
