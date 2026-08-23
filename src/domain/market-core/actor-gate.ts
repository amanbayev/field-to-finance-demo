import type { PlatformRoleId } from "@/domain/identity";

const TRADING_ROLES: readonly PlatformRoleId[] = ["INVESTOR", "TRADER"];
const SUPERVISORY_ROLES: readonly PlatformRoleId[] = [
  "SYSTEM_ADMIN",
  "REGULATOR",
  "REGISTRAR_OPERATOR",
];

export function participantMayTrade(input: {
  roleId: PlatformRoleId;
  participantId: string | null;
  instrumentId: string;
  eligibility: "ELIGIBLE" | "NOT_ELIGIBLE" | "NOT_ASSESSED" | "POLICY_PENDING";
}): boolean {
  if (input.instrumentId === "F2F-PROTOCOL-INVESTMENT") {
    return false;
  }
  if (!input.participantId) {
    return false;
  }
  if (!TRADING_ROLES.includes(input.roleId)) {
    return false;
  }
  return input.eligibility === "ELIGIBLE";
}

export function roleMayDirectMatching(roleId: PlatformRoleId): boolean {
  void roleId;
  return false;
}

export function roleMayReadAllMarketRecords(roleId: PlatformRoleId): boolean {
  return SUPERVISORY_ROLES.includes(roleId);
}
