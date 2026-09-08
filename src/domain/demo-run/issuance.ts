import type { DemoResetRunContext, DemoResetRunScopeRefusal } from "@/lib/demo-reset";

/** A retry token identifies a command, never its resulting run or its operator. */
export interface DemoRunIssuanceRequest {
  issuanceRequestId: string;
  organizationNames: { producer: string; issuer: string; investor: string };
}

/** Historical issuance receipt. It does not assert that the run is still CURRENT. */
export interface DemoRunIssuanceReceipt {
  issuanceRequestId: string;
  runId: string;
  producerOrganizationId: string;
  issuerOrganizationId: string;
  investorOrganizationId: string;
}

export type DemoRunIssuanceResult =
  | { kind: "ISSUED"; receipt: DemoRunIssuanceReceipt }
  | { kind: "REQUEST_CONFLICT" }
  // A transport failure may follow a commit. Retry only the SAME request ID.
  | { kind: "UNCONFIRMED" };

export type DemoRunIssuanceOutcome =
  | DemoRunIssuanceResult
  | { kind: "DENIED"; refusal: DemoResetRunScopeRefusal }
  | { kind: "INVALID_REQUEST" };

/** Internal capability; a request must never supply this port or its context. */
export interface DemoRunIssuer {
  issue(context: DemoResetRunContext, request: DemoRunIssuanceRequest): Promise<DemoRunIssuanceResult>;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[ \t\r\n]+/g, " ").trim();
  // Match PostgreSQL character length, including supplementary Unicode characters.
  return [...name].length >= 1 && [...name].length <= 120 && !/\p{Cc}/u.test(name) ? name : null;
}

/** Strict allowlist: even a well-formed supplied run ID or operator is rejected. */
export function parseDemoRunIssuanceRequest(value: unknown): DemoRunIssuanceRequest | null {
  if (!exactObject(value, ["issuanceRequestId", "organizationNames"]) || !isUuid(value.issuanceRequestId)) return null;
  const names = value.organizationNames;
  if (!exactObject(names, ["producer", "issuer", "investor"])) return null;
  const producer = normalizeName(names.producer);
  const issuer = normalizeName(names.issuer);
  const investor = normalizeName(names.investor);
  if (!producer || !issuer || !investor) return null;
  return {
    issuanceRequestId: value.issuanceRequestId.toLowerCase(),
    organizationNames: { producer, issuer, investor },
  };
}

export function parseDemoRunIssuanceReceipt(value: unknown, requestId: string): DemoRunIssuanceReceipt | null {
  const keys = ["issuanceRequestId", "runId", "producerOrganizationId", "issuerOrganizationId", "investorOrganizationId"];
  if (!exactObject(value, keys) || !keys.every((key) => isUuid(value[key])) || value.issuanceRequestId !== requestId) return null;
  const receipt = value as unknown as DemoRunIssuanceReceipt;
  if (new Set([receipt.runId, receipt.producerOrganizationId, receipt.issuerOrganizationId, receipt.investorOrganizationId]).size !== 4) return null;
  return receipt;
}
