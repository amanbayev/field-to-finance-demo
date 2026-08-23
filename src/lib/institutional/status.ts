export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export type StatusFamily =
  | "maturity"
  | "lifecycle"
  | "order"
  | "settlement"
  | "eligibility"
  | "market"
  | "verification";

const MATURITY: Record<string, StatusTone> = {
  LIVE: "success",
  DEMO: "neutral",
  STRUCTURING: "warning",
  CONCEPT: "neutral",
};

const LIFECYCLE: Record<string, StatusTone> = {
  IN_REVIEW: "warning",
  ADMITTED: "success",
  ISSUED: "success",
  TRADING: "success",
  STRUCTURING: "warning",
  FUTURE: "neutral",
};

const ORDER: Record<string, StatusTone> = {
  OPEN: "info",
  PARTIALLY_FILLED: "warning",
  FILLED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
};

const SETTLEMENT: Record<string, StatusTone> = {
  MATCHED: "warning",
  CLEARING_READY: "warning",
  SETTLEMENT_PENDING: "warning",
  AWAITING_DEVNET_SETTLEMENT: "warning",
  SETTLED: "success",
  FINAL: "success",
  FAILED: "danger",
  NONE: "neutral",
};

const ELIGIBILITY: Record<string, StatusTone> = {
  ELIGIBLE: "success",
  NOT_ASSESSED: "neutral",
  RESTRICTED: "warning",
  INELIGIBLE: "danger",
  NOT_ELIGIBLE: "danger",
  POLICY_PENDING: "warning",
};

const MARKET: Record<string, StatusTone> = {
  OPEN: "success",
  DEMO_OPEN: "success",
  CLOSED: "neutral",
  DEMO_CLOSED: "neutral",
  PRIMARY_ONLY: "info",
  SECONDARY_OPEN: "success",
};

const VERIFICATION: Record<string, StatusTone> = {
  VERIFIED: "success",
  ATTESTED: "success",
  PENDING: "warning",
  PENDING_ATTESTATION: "warning",
  FAILED: "danger",
};

const FAMILY_TONES: Record<StatusFamily, Record<string, StatusTone>> = {
  maturity: MATURITY,
  lifecycle: LIFECYCLE,
  order: ORDER,
  settlement: SETTLEMENT,
  eligibility: ELIGIBILITY,
  market: MARKET,
  verification: VERIFICATION,
};

export function toneForStatus(family: StatusFamily, code: string): StatusTone {
  return FAMILY_TONES[family][code] ?? "neutral";
}
