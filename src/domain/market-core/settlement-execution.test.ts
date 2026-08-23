import { describe, expect, it } from "vitest";
import { planSettlementExecution, shouldLookupBeforeRetry } from "./settlement-execution";
import type { SettlementRecord } from "./settlement-lifecycle";

function record(overrides: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    settlementId: "SET-SEED-001",
    tradeId: "TRD-SEED-001",
    provider: "DEMO",
    status: "AWAITING_DEVNET_SETTLEMENT",
    idempotencyKey: "seed-settlement-SET-SEED-001",
    assetTxSignature: null,
    paymentTxSignature: null,
    atomicDvpTxSignature: null,
    submittedAt: null,
    chainConfirmedAt: null,
    registryFinalizedAt: null,
    settledAt: null,
    lastError: null,
    retryCount: 0,
    ...overrides,
  };
}

describe("settlement execution recovery", () => {
  it("does not submit while settlement is disabled", () => {
    const intent = planSettlementExecution(record());
    expect(intent.allowNewChainSubmit).toBe(false);
    expect(intent.kind).toBe("NONE");
  });

  it("looks up a known signature after RPC timeout instead of resubmitting", () => {
    const submitted = record({
      status: "SETTLEMENT_SUBMITTED",
      atomicDvpTxSignature: "timeoutSig",
      submittedAt: "2026-08-23T12:00:00Z",
    });
    expect(shouldLookupBeforeRetry(submitted)).toBe(true);
    const intent = planSettlementExecution(submitted, "UNKNOWN");
    expect(intent.kind).toBe("SIGNATURE_LOOKUP");
    expect(intent.allowNewChainSubmit).toBe(false);
    expect(intent.signatureToLookup).toBe("timeoutSig");
  });

  it("finalizes registrar only after chain confirmation", () => {
    const intent = planSettlementExecution(
      record({
        status: "CHAIN_CONFIRMED",
        atomicDvpTxSignature: "confirmedSig",
        chainConfirmedAt: "2026-08-23T12:01:00Z",
      }),
    );
    expect(intent.kind).toBe("REGISTRY_FINALIZE");
    expect(intent.allowNewChainSubmit).toBe(false);
  });
});
