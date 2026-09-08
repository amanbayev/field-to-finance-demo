import type { DemoResetRunContext, DemoResetRunScopeRefusal } from "@/lib/demo-reset";
import { isUuid } from "./issuance";

export interface DemoRunParticipantRequest {
  requestId: string;
  producerUserId: string;
  issuerUserId: string;
  investorUserId: string;
}

export const DEMO_PARTICIPANT_ROLES = {
  producer: "PRODUCER_ADMIN", issuer: "ISSUER_OPERATOR", investor: "INVESTOR",
} as const;

interface ParticipantReceipt {
  userId: string;
  organizationId: string;
  membershipId: string;
  membershipRoleId: string;
  roleId: string;
}

/** Historical command result, not a fresh assertion of active participation. */
export interface DemoRunParticipantReceipt {
  requestId: string;
  runId: string;
  producer: ParticipantReceipt;
  issuer: ParticipantReceipt;
  investor: ParticipantReceipt;
}

export type DemoRunParticipantResult =
  | { kind: "BOUND"; receipt: DemoRunParticipantReceipt }
  | { kind: "REQUEST_CONFLICT" | "RUN_CHANGED" | "CURRENT_RUN_MISSING" | "RUN_MISMATCH" | "PROFILE_UNAVAILABLE" | "UNCONFIRMED" };
export type DemoRunParticipantOutcome = DemoRunParticipantResult
  | { kind: "DENIED"; refusal: DemoResetRunScopeRefusal }
  | { kind: "INVALID_REQUEST" };

/** Internal wiring port. Neither it nor context may come from caller data. */
export interface DemoRunParticipantBinder {
  bind(context: DemoResetRunContext, request: DemoRunParticipantRequest): Promise<DemoRunParticipantResult>;
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseDemoRunParticipantRequest(value: unknown): DemoRunParticipantRequest | null {
  const keys = ["requestId", "producerUserId", "issuerUserId", "investorUserId"];
  if (!exactObject(value, keys) || !keys.every((key) => isUuid(value[key]))) return null;
  const request = Object.fromEntries(keys.map((key) => [key, (value[key] as string).toLowerCase()])) as unknown as DemoRunParticipantRequest;
  return new Set(Object.values(request)).size === 4 ? request : null;
}

export function parseDemoRunParticipantReceipt(value: unknown, request: DemoRunParticipantRequest): DemoRunParticipantReceipt | null {
  if (!exactObject(value, ["requestId", "runId", "producer", "issuer", "investor"]) ||
    value.requestId !== request.requestId || !isUuid(value.runId)) return null;
  const identities = [value.runId, request.requestId, request.producerUserId, request.issuerUserId, request.investorUserId];
  for (const participant of ["producer", "issuer", "investor"] as const) {
    const item = value[participant];
    if (!exactObject(item, ["userId", "organizationId", "membershipId", "membershipRoleId", "roleId"]) ||
      item.userId !== request[`${participant}UserId`] || item.roleId !== DEMO_PARTICIPANT_ROLES[participant]) return null;
    for (const key of ["organizationId", "membershipId", "membershipRoleId"] as const) {
      if (!isUuid(item[key])) return null;
      identities.push(item[key].toLowerCase());
    }
  }
  if (new Set(identities).size !== identities.length) return null;
  return value as unknown as DemoRunParticipantReceipt;
}
