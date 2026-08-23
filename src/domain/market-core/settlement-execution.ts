import {
  nextSettlementIntent,
  type SettlementIntent,
  type SettlementRecord,
} from "./settlement-lifecycle";
import { SECONDARY_SETTLEMENT_ENABLED } from "./secondary-settlement-provider";

/**
 * Recovery wrapper around the settlement state machine.
 *
 * Never submits a second transfer when a signature is known.
 * Registrar finalization after CHAIN_CONFIRMED does not resubmit.
 */
export function planSettlementExecution(
  record: SettlementRecord,
  lookupResolved?: "UNKNOWN" | "LANDED" | "FAILED",
): SettlementIntent {
  const intent = nextSettlementIntent(record, {
    settlementEnabled: SECONDARY_SETTLEMENT_ENABLED,
    lookupResolved,
  });
  if (intent.kind === "CHAIN_TRANSFER" && !SECONDARY_SETTLEMENT_ENABLED) {
    return {
      ...intent,
      kind: "NONE",
      allowNewChainSubmit: false,
      reason: "Secondary settlement remains disabled. No chain submit.",
    };
  }
  return intent;
}

export function shouldLookupBeforeRetry(record: SettlementRecord): boolean {
  return Boolean(
    record.atomicDvpTxSignature ?? record.assetTxSignature ?? record.paymentTxSignature,
  );
}
