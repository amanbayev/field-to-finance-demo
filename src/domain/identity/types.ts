export const ORGANIZATION_TYPES = [
  "PLATFORM",
  "REGULATOR",
  "REGISTRAR",
  "SCAS",
  "PRODUCER",
  "ISSUER",
  "INVESTMENT_FUND",
  "TRADING_FIRM",
  "COMPLIANCE_PROVIDER",
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const PLATFORM_ROLES = [
  "SYSTEM_ADMIN",
  "REGULATOR",
  "REGISTRAR_OPERATOR",
  "SCAS_OPERATOR",
  "ISSUER_OPERATOR",
  "PRODUCER_ADMIN",
  "INVESTOR",
  "TRADER",
  "COMPLIANCE_OFFICER",
] as const;

export type PlatformRoleId = (typeof PLATFORM_ROLES)[number];

export const PRIVILEGED_ROLES = [
  "SYSTEM_ADMIN",
  "REGULATOR",
  "REGISTRAR_OPERATOR",
  "SCAS_OPERATOR",
  "COMPLIANCE_OFFICER",
] as const;

export type PrivilegedRoleId = (typeof PRIVILEGED_ROLES)[number];

export const SELF_REQUESTABLE_INTENTS = [
  "PRODUCER",
  "INVESTOR",
  "TRADER",
  "OTHER",
] as const;

export type OnboardingIntent = (typeof SELF_REQUESTABLE_INTENTS)[number];

export const PERMISSIONS = [
  "contracts.read.all",
  "contracts.read.own",
  "contracts.manage.own",
  "scas.read",
  "scas.attest",
  "scas.match",
  "pools.read",
  "pools.manage",
  "issuance.read",
  "issuance.manage",
  "market.read",
  "placement.read.own",
  "placement.read.all",
  "portfolio.read.own",
  "compliance.read",
  "compliance.manage",
  "regulator.read",
  "admin.access",
  "admin.users",
  "admin.organizations",
  "admin.roles",
  "admin.demo_personas",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const APP_AUDIT_KINDS = [
  "AUTH",
  "ADMIN",
  "DEMO_CONTEXT",
  "BLOCKCHAIN",
] as const;

export type AppAuditKind = (typeof APP_AUDIT_KINDS)[number];

export const MEMBERSHIP_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "INVITED",
  "INACTIVE",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ORGANIZATION_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PERSONA_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type PersonaStatus = (typeof PERSONA_STATUSES)[number];

export const PERSONA_GROUPS = ["system", "control", "agro", "market"] as const;
export type PersonaGroup = (typeof PERSONA_GROUPS)[number];

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;
  externalProducerRef?: string | null;
  externalInvestorRef?: string | null;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  organizationId: string;
  status: MembershipStatus;
  roleIds: PlatformRoleId[];
}

export interface DemoPersonaRecord {
  id: string;
  displayName: string;
  groupKey: PersonaGroup;
  organizationId: string;
  roleId: PlatformRoleId;
  status: PersonaStatus;
  externalProducerRef?: string | null;
  externalInvestorRef?: string | null;
  walletAddress?: string | null;
  investorAta?: string | null;
}

export interface ActorPrincipal {
  userId: string;
  email: string | null;
  displayName: string;
  status: UserStatus;
  permissions: Permission[];
  memberships: MembershipRecord[];
  organizations: OrganizationRecord[];
  organization?: OrganizationRecord;
  roleIds: PlatformRoleId[];
}

export interface EffectiveActor {
  roleId: PlatformRoleId;
  permissions: Permission[];
  organization?: OrganizationRecord;
  producerIds: string[];
  investorReference?: string | null;
  walletAddress?: string | null;
  investorAta?: string | null;
  personaId?: string | null;
}

export interface ActorContext {
  principal: ActorPrincipal;
  effective: EffectiveActor;
  activeOrganizationId?: string | null;
  demoPersona?: DemoPersonaRecord | null;
  isImpersonating: boolean;
}

export type AuthFailureCode =
  | "unauthenticated"
  | "forbidden"
  | "suspended_user"
  | "suspended_membership"
  | "suspended_organization"
  | "inactive_persona"
  | "auth_unavailable"
  | "not_configured";

export class AuthorizationError extends Error {
  constructor(
    readonly code: AuthFailureCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthorizationError";
  }
}
