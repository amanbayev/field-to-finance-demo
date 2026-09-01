import { permissionsForRole, permissionsForRoles } from "./permissions";
import { isPrivilegedRole } from "./roles";
import {
  producerIdsForOrganization,
  investorReferenceFor,
} from "./scope";
import { demoMembershipForPersona } from "@/data/identity/demo-catalog";
import type {
  ActorContext,
  ActorPrincipal,
  DemoPersonaRecord,
  EffectiveActor,
  MembershipRecord,
  OrganizationRecord,
  PlatformRoleId,
} from "./types";
import { AuthorizationError } from "./types";

export interface SessionContextState {
  principalUserId: string;
  activeOrganizationId?: string | null;
  effectiveDemoPersonaId?: string | null;
}

export function selectActiveMembership(
  memberships: MembershipRecord[],
  organizations: OrganizationRecord[],
  activeOrganizationId?: string | null,
): { membership: MembershipRecord; organization: OrganizationRecord } | null {
  if (activeOrganizationId) {
    const preferred = memberships.find(
      (item) => item.organizationId === activeOrganizationId,
    );
    if (preferred) {
      if (preferred.status === "SUSPENDED" || preferred.status === "INACTIVE") {
        throw new AuthorizationError("suspended_membership");
      }
      const organization = organizations.find(
        (org) => org.id === preferred.organizationId,
      );
      if (!organization) {
        return null;
      }
      if (organization.status !== "ACTIVE") {
        throw new AuthorizationError("suspended_organization");
      }
      return { membership: preferred, organization };
    }
  }
  const active = memberships.filter((item) => item.status === "ACTIVE");
  if (active.length === 0) {
    if (memberships.length > 0) {
      throw new AuthorizationError("suspended_membership");
    }
    return null;
  }
  const preferred = active[0];
  const organization = organizations.find(
    (org) => org.id === preferred.organizationId,
  );
  if (!organization) {
    return null;
  }
  if (organization.status !== "ACTIVE") {
    throw new AuthorizationError("suspended_organization");
  }
  return { membership: preferred, organization };
}

export function buildPrincipal(input: {
  userId: string;
  email: string | null;
  displayName: string;
  status: ActorPrincipal["status"];
  memberships: MembershipRecord[];
  organizations: OrganizationRecord[];
  activeOrganizationId?: string | null;
}): ActorPrincipal {
  if (input.status === "SUSPENDED") {
    throw new AuthorizationError("suspended_user");
  }
  const selected = selectActiveMembership(
    input.memberships,
    input.organizations,
    input.activeOrganizationId,
  );
  if (selected && selected.membership.status === "SUSPENDED") {
    throw new AuthorizationError("suspended_membership");
  }
  const roleIds = selected?.membership.roleIds ?? [];
  return {
    userId: input.userId,
    email: input.email,
    displayName: input.displayName,
    status: input.status,
    memberships: input.memberships,
    organizations: input.organizations,
    organization: selected?.organization,
    roleIds,
    permissions: permissionsForRoles(roleIds),
  };
}

export function buildEffectiveFromMembership(
  principal: ActorPrincipal,
): EffectiveActor {
  const roleId: PlatformRoleId = principal.roleIds[0] ?? "INVESTOR";
  const membershipId =
    principal.memberships.find(
      (item) => item.organizationId === principal.organization?.id,
    )?.id ?? null;
  return {
    roleId,
    permissions: principal.permissions,
    organization: principal.organization,
    membershipId,
    producerIds: producerIdsForOrganization(principal.organization),
    investorReference: investorReferenceFor(principal.organization),
    personaId: null,
  };
}

export function buildEffectiveFromPersona(
  persona: DemoPersonaRecord,
  organization: OrganizationRecord,
): EffectiveActor {
  if (persona.status !== "ACTIVE") {
    throw new AuthorizationError("inactive_persona");
  }
  if (organization.status !== "ACTIVE") {
    throw new AuthorizationError("suspended_organization");
  }
  return {
    roleId: persona.roleId,
    permissions: permissionsForRole(persona.roleId),
    organization,
    membershipId: demoMembershipForPersona(persona.id)?.id ?? null,
    producerIds: producerIdsForOrganization(organization, persona),
    investorReference: investorReferenceFor(organization, persona),
    walletAddress: persona.walletAddress,
    investorAta: persona.investorAta,
    personaId: persona.id,
  };
}

export function principalMayAssumePersonas(principal: ActorPrincipal): boolean {
  return principal.permissions.includes("admin.demo_personas");
}

export function assumeDemoPersona(input: {
  principal: ActorPrincipal;
  persona: DemoPersonaRecord | undefined;
  organization: OrganizationRecord | undefined;
}): {
  effective: EffectiveActor;
  demoPersona: DemoPersonaRecord;
  isImpersonating: true;
} {
  if (!principalMayAssumePersonas(input.principal)) {
    throw new AuthorizationError("forbidden");
  }
  if (!input.persona) {
    throw new AuthorizationError("forbidden");
  }
  if (input.persona.status !== "ACTIVE") {
    throw new AuthorizationError("inactive_persona");
  }
  if (!input.organization || input.organization.id !== input.persona.organizationId) {
    throw new AuthorizationError("forbidden");
  }
  return {
    effective: buildEffectiveFromPersona(input.persona, input.organization),
    demoPersona: input.persona,
    isImpersonating: true,
  };
}

/**
 * Resolve the actor from server-held session context only.
 * Client-supplied persona IDs are ignored.
 */
export function resolveActorContext(input: {
  principal: ActorPrincipal;
  session: SessionContextState | null;
  persona: DemoPersonaRecord | undefined;
  personaOrganization: OrganizationRecord | undefined;
  clientClaimedPersonaId?: string | null;
}): ActorContext {
  void input.clientClaimedPersonaId;
  const sessionPersonaId = input.session?.effectiveDemoPersonaId ?? null;
  if (sessionPersonaId) {
    const assumed = assumeDemoPersona({
      principal: input.principal,
      persona: input.persona && input.persona.id === sessionPersonaId
        ? input.persona
        : undefined,
      organization: input.personaOrganization,
    });
    return {
      principal: input.principal,
      effective: assumed.effective,
      activeOrganizationId:
        assumed.effective.organization?.id ?? input.session?.activeOrganizationId,
      demoPersona: assumed.demoPersona,
      isImpersonating: true,
    };
  }

  return {
    principal: input.principal,
    effective: buildEffectiveFromMembership(input.principal),
    activeOrganizationId:
      input.session?.activeOrganizationId ?? input.principal.organization?.id,
    demoPersona: null,
    isImpersonating: false,
  };
}

export function exitDemoPersona(principal: ActorPrincipal): ActorContext {
  return {
    principal,
    effective: buildEffectiveFromMembership(principal),
    activeOrganizationId: principal.organization?.id,
    demoPersona: null,
    isImpersonating: false,
  };
}

export function cannotSelfAssignPrivileged(
  requestedRole: string,
  actorIsAdmin: boolean,
): boolean {
  return isPrivilegedRole(requestedRole) && !actorIsAdmin;
}
