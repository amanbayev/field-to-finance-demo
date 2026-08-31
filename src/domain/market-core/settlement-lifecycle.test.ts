import { describe, expect, it } from "vitest";
import {
  canMarkSettled,
  nextSettlementIntent,
  wheatReconciliationExceptions,
  type SettlementRecord,
  PRE_SETTLEMENT_WHEAT_RECONCILIATION,
  POST_SETTLEMENT_WHEAT_RECONCILIATION,
} from "./settlement-lifecycle";

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

describe("settlement lifecycle", () => {
  it("does not allow a new chain submit while settlement is disabled", () => {
    const intent = nextSettlementIntent(record(), { settlementEnabled: false });
    expect(intent.allowNewChainSubmit).toBe(false);
    expect(intent.kind).toBe("NONE");
  });

  it("looks up a known signature after submit timeout instead of resubmitting", () => {
    const intent = nextSettlementIntent(
      record({
        status: "SETTLEMENT_SUBMITTED",
        assetTxSignature: "5fakeSignatureForLookupOnly",
        submittedAt: "2026-08-23T12:00:00Z",
      }),
      { settlementEnabled: true },
    );
    expect(intent.kind).toBe("SIGNATURE_LOOKUP");
    expect(intent.allowNewChainSubmit).toBe(false);
    expect(intent.signatureToLookup).toBe("5fakeSignatureForLookupOnly");
  });

  it("finalizes registry only after CHAIN_CONFIRMED and never resubmits", () => {
    const intent = nextSettlementIntent(
      record({
        status: "CHAIN_CONFIRMED",
        atomicDvpTxSignature: "confirmedSig",
        chainConfirmedAt: "2026-08-23T12:01:00Z",
      }),
      { settlementEnabled: true },
    );
    expect(intent.kind).toBe("REGISTRY_FINALIZE");
    expect(intent.allowNewChainSubmit).toBe(false);
  });

  it("does not mark SETTLED without chain evidence and registrar finalization", () => {
    expect(
      canMarkSettled(
        record({
          status: "SETTLED",
          settledAt: "2026-08-23T12:02:00Z",
        }),
      ),
    ).toBe(false);
  });

  it("treats pre-settlement registered vs chain 990/10/0 as matched", () => {
    expect(wheatReconciliationExceptions(PRE_SETTLEMENT_WHEAT_RECONCILIATION)).toEqual([]);
  });

  it("documents the future post-settlement 8/2 expectation without applying it", () => {
    expect(
      POST_SETTLEMENT_WHEAT_RECONCILIATION.find((row) => row.participantId === "INVESTOR-0001")
        ?.registeredOwned,
    ).toBe(8);
    expect(
      POST_SETTLEMENT_WHEAT_RECONCILIATION.find((row) => row.participantId === "GRAIN-DESK")
        ?.registeredOwned,
    ).toBe(2);
    expect(wheatReconciliationExceptions(PRE_SETTLEMENT_WHEAT_RECONCILIATION)).toEqual([]);
  });

  it("does not allow a new submit after timeout when no signature is stored", () => {
    const intent = nextSettlementIntent(
      record({
        status: "SETTLEMENT_SUBMITTED",
        submittedAt: "2026-08-23T12:00:00Z",
      }),
      { settlementEnabled: true, lookupResolved: "UNKNOWN" },
    );
    expect(intent.kind).toBe("SIGNATURE_LOOKUP");
    expect(intent.allowNewChainSubmit).toBe(false);
  });
});
