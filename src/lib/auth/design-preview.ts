import { cookies } from "next/headers";
import {
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
} from "@/domain/identity";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  demoPersonas,
  organizationById,
} from "@/data/identity/demo-catalog";

export const DESIGN_PERSONA_COOKIE = "ftf_design_persona";
export const DEFAULT_DESIGN_PERSONA_ID = "DEMO-REGISTRAR-001";

const DESIGN_USER_ID = "design-preview-user";

/**
 * Local `next dev` only. Lets the redesign walk desks without a Supabase
 * session. Production and `next start` never take this path.
 */
export function isDesignPreviewActor(actor: { principal: { userId: string } } | null): boolean {
  return actor?.principal.userId === DESIGN_USER_ID;
}

export function isDesignPreviewEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function catalogPersonasForSwitcher() {
  return demoPersonas().map((persona) => ({
    id: persona.id,
    display_name: persona.displayName,
    group_key: persona.groupKey,
    role_id: persona.roleId,
    status: persona.status,
    external_producer_ref: persona.externalProducerRef,
    external_investor_ref: persona.externalInvestorRef,
    organization_id: persona.organizationId,
    organizationName:
      organizationById(persona.organizationId)?.name ?? "—",
  }));
}

export async function getDesignPreviewActor(): Promise<ActorContext | null> {
  if (!isDesignPreviewEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const requested = cookieStore.get(DESIGN_PERSONA_COOKIE)?.value;
  const persona =
    demoPersonaById(requested ?? "") ??
    demoPersonaById(DEFAULT_DESIGN_PERSONA_ID);
  if (!persona) {
    return null;
  }
  const organization = organizationById(persona.organizationId);
  if (!organization) {
    return null;
  }

  const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance");
  if (!platform) {
    return null;
  }

  const principal = buildPrincipal({
    userId: DESIGN_USER_ID,
    email: "design@localhost",
    displayName: "Design desk",
    status: "ACTIVE",
    organizations: [platform, organization],
    memberships: [
      {
        id: "design-membership-platform",
        userId: DESIGN_USER_ID,
        organizationId: platform.id,
        status: "ACTIVE",
        roleIds: ["SYSTEM_ADMIN"],
      },
    ],
    activeOrganizationId: platform.id,
  });

  return resolveActorContext({
    principal,
    session: {
      principalUserId: DESIGN_USER_ID,
      activeOrganizationId: platform.id,
      effectiveDemoPersonaId: persona.id,
    },
    persona,
    personaOrganization: organization,
  });
}
