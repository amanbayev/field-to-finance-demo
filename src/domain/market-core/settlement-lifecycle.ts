/**
 * Secondary settlement state machine (Phase 5B.1).
 *
 * Matching may complete. Devnet settlement execution remains disabled.
 * SETTLED is only valid after both chain confirmation and registrar finalization.
 *
 * Timeout after a submit must LOOK UP the known signature / idempotency
 * reference. It must not blindly resubmit a transfer.
 *
 * CHAIN_CONFIRMED + registrar DB failure: do not send another chain transfer.
 * Reconcile / finalize the registrar record from confirmed chain evidence.
 */

export const TRADE_CLEARING_STATES = [
  "MATCHED",
  "CLEARING_READY",
  "AWAITING_DEVNET_SETTLEMENT",
] as const;

export const SETTLEMENT_PIPELINE = [
  "MATCHED",
  "CLEARING_READY",
  "SETTLEMENT_READY",
  "SETTLEMENT_SUBMITTING",
  "SETTLEMENT_SUBMITTED",
  "CHAIN_CONFIRMED",
  "REGISTRY_FINALIZING",
  "SETTLED",
] as const;

export type SettlementPipelineState = (typeof SETTLEMENT_PIPELINE)[number];
export type SettlementLifecycleState = SettlementPipelineState | "SETTLEMENT_EXCEPTION";

export const PARKED_DEMO_SETTLEMENT_STATE = "AWAITING_DEVNET_SETTLEMENT" as const;

export interface SettlementRecord {
  settlementId: string;
  tradeId: string;
  provider: "DEVNET_DVP" | "DEMO";
  status: SettlementLifecycleState | typeof PARKED_DEMO_SETTLEMENT_STATE;
  idempotencyKey: string;
  assetTxSignature: string | null;
  paymentTxSignature: string | null;
  atomicDvpTxSignature: string | null;
  submittedAt: string | null;
  chainConfirmedAt: string | null;
  registryFinalizedAt: string | null;
  settledAt: string | null;
  lastError: string | null;
  retryCount: number;
}

export interface SettlementIntent {
  kind: "CHAIN_TRANSFER" | "SIGNATURE_LOOKUP" | "REGISTRY_FINALIZE" | "NONE";
  reason: string;
  signatureToLookup: string | null;
  allowNewChainSubmit: boolean;
}

export function knownSettlementSignature(record: SettlementRecord): string | null {
  return record.atomicDvpTxSignature ?? record.assetTxSignature ?? record.paymentTxSignature;
}

export function canMarkSettled(record: SettlementRecord): boolean {
  return (
    record.status === "SETTLED" &&
    Boolean(knownSettlementSignature(record)) &&
    Boolean(record.chainConfirmedAt) &&
    Boolean(record.registryFinalizedAt) &&
    Boolean(record.settledAt)
  );
}

export function nextSettlementIntent(
  record: SettlementRecord,
  input: { settlementEnabled: boolean; lookupResolved?: "UNKNOWN" | "LANDED" | "FAILED" },
): SettlementIntent {
  const signature = knownSettlementSignature(record);
  if (
    record.status === "SETTLED" ||
    record.status === "REGISTRY_FINALIZING" ||
    record.status === "CHAIN_CONFIRMED"
  ) {
    return {
      kind: record.status === "SETTLED" ? "NONE" : "REGISTRY_FINALIZE",
      reason:
        record.status === "SETTLED"
          ? "Already settled. No chain transfer."
          : "Chain is confirmed. Finalize registrar record only. Do not resubmit a transfer.",
      signatureToLookup: signature,
      allowNewChainSubmit: false,
    };
  }
  if (record.status === "SETTLEMENT_EXCEPTION") {
    return {
      kind: signature ? "SIGNATURE_LOOKUP" : "NONE",
      reason: signature
        ? "Exception with a known signature. Look up the existing transaction before any retry."
        : "Exception without a signature. Operator review required. Do not invent a transfer.",
      signatureToLookup: signature,
      allowNewChainSubmit: false,
    };
  }
  if (!input.settlementEnabled) {
    return {
      kind: "NONE",
      reason: "Matching demonstrator is active. Devnet settlement is awaiting approval.",
      signatureToLookup: signature,
      allowNewChainSubmit: false,
    };
  }
  if (record.status === "SETTLEMENT_SUBMITTED" || record.status === "SETTLEMENT_SUBMITTING") {
    if (signature) {
      return {
        kind: "SIGNATURE_LOOKUP",
        reason:
          "A submit may have landed after a timeout. Look up the known signature. Never blindly resubmit.",
        signatureToLookup: signature,
        allowNewChainSubmit: false,
      };
    }
    if (input.lookupResolved === "UNKNOWN") {
      return {
        kind: "SIGNATURE_LOOKUP",
        reason: "Timeout without a stored signature. Resolve the idempotency reference before submit.",
        signatureToLookup: record.idempotencyKey,
        allowNewChainSubmit: false,
      };
    }
    return {
      kind: "SIGNATURE_LOOKUP",
      reason: "Submit in flight. Look up idempotency reference. Do not open a second transfer.",
      signatureToLookup: record.idempotencyKey,
      allowNewChainSubmit: false,
    };
  }
  if (
    record.status === "SETTLEMENT_READY" ||
    record.status === "AWAITING_DEVNET_SETTLEMENT" ||
    record.status === "MATCHED" ||
    record.status === "CLEARING_READY"
  ) {
    return {
      kind: "CHAIN_TRANSFER",
      reason: "No prior signature. First submit is permitted only when settlementEnabled is true.",
      signatureToLookup: null,
      allowNewChainSubmit: true,
    };
  }
  return {
    kind: "NONE",
    reason: "No settlement action.",
    signatureToLookup: signature,
    allowNewChainSubmit: false,
  };
}

export interface WheatPosition {
  participantId: string;
  registeredOwned: number;
  chainBalance: number;
}

export function wheatReconciliationExceptions(
  rows: readonly WheatPosition[],
): WheatPosition[] {
  return rows.filter((row) => row.registeredOwned !== row.chainBalance);
}

export const PRE_SETTLEMENT_WHEAT_RECONCILIATION: readonly WheatPosition[] = [
  { participantId: "REGISTRAR", registeredOwned: 990, chainBalance: 990 },
  { participantId: "INVESTOR-0001", registeredOwned: 10, chainBalance: 10 },
  { participantId: "GRAIN-DESK", registeredOwned: 0, chainBalance: 0 },
];

export const POST_SETTLEMENT_WHEAT_RECONCILIATION: readonly WheatPosition[] = [
  { participantId: "REGISTRAR", registeredOwned: 990, chainBalance: 990 },
  { participantId: "INVESTOR-0001", registeredOwned: 8, chainBalance: 8 },
  { participantId: "GRAIN-DESK", registeredOwned: 2, chainBalance: 2 },
];
