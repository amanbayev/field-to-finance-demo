import { describe, expect, it } from "vitest";
import {
  actorCan,
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  demoPersonas,
  organizationById,
} from "@/data/identity/demo-catalog";
import {
  navigationForActor,
  protocolContextsForActor,
  routeVisibleTo,
  visibleGlobalRoutes,
  visibleNavigationHrefs,
  visibleProtocolModuleRoutes,
} from "@/lib/navigation/policy";
import {
  F2F_PROTOCOL_ID,
  ROUTE_REGISTRY,
  isProtocolModuleRoute,
} from "@/lib/navigation/route-registry";

const platform = DEMO_ORGANIZATIONS.find((o) => o.slug === "field-to-finance")!;

function membership(
  overrides: Partial<MembershipRecord> &
    Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "admin-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function adminPrincipal() {
  return buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "amanbayev",
    status: "ACTIVE",
    organizations: [platform],
    memberships: [
      membership({
        userId: "admin-1",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
  });
}

function asPersona(personaId: string): ActorContext {
  const persona = demoPersonaById(personaId)!;
  const organization = organizationById(persona.organizationId)!;
  return resolveActorContext({
    principal: adminPrincipal(),
    session: { principalUserId: "admin-1", effectiveDemoPersonaId: personaId },
    persona,
    personaOrganization: organization,
  });
}

const AGRICULTURE_PATHS = [
  "/fields",
  "/contracts",
  "/pools",
  "/coverage",
  "/backing",
  "/monitoring",
  "/documents",
  "/finance",
  "/scas",
  "/scas/verification",
  "/scas/dacs",
  "/scas/matching",
  "/scas/monitoring",
  "/issuer/dacs",
  "/registrar/intake",
];

describe("navigation × access matrix", () => {
  const personaIds = demoPersonas().map((p) => p.id);

  it("covers every canonical demo persona", () => {
    expect(personaIds.length).toBeGreaterThan(0);
    for (const id of personaIds) {
      expect(() => asPersona(id)).not.toThrow();
    }
  });

  it.each(personaIds)(
    "keeps agriculture modules out of %s global navigation",
    (personaId) => {
      const actor = asPersona(personaId);
      const globalPaths = visibleGlobalRoutes(actor).map((route) =>
        route.href.kind === "STATIC" ? route.href.path : route.href.pattern,
      );
      for (const path of AGRICULTURE_PATHS) {
        expect(globalPaths, `${personaId} global nav`).not.toContain(path);
      }
    },
  );

  it.each(personaIds)("shows no empty navigation section for %s", (personaId) => {
    for (const section of navigationForActor(asPersona(personaId))) {
      expect(section.entries.length, `${personaId} ${section.kind}`).toBeGreaterThan(0);
    }
  });

  it("returns no F2F modules in a non-agriculture protocol context", () => {
    for (const personaId of personaIds) {
      const actor = asPersona(personaId);
      // A synthetic protocol with no registered modules.
      expect(visibleProtocolModuleRoutes(actor, "TIDAL")).toEqual([]);
      expect(visibleProtocolModuleRoutes(actor, "WATER")).toEqual([]);
    }
  });

  it("returns nothing for a missing protocol context", () => {
    const actor = asPersona("DEMO-FARM-001");
    expect(visibleProtocolModuleRoutes(actor, null)).toEqual([]);
    expect(visibleProtocolModuleRoutes(null, F2F_PROTOCOL_ID)).toEqual([]);
  });

  it("gives an unauthenticated visitor only the overview", () => {
    expect(visibleNavigationHrefs(null)).toEqual(["/"]);
    expect(protocolContextsForActor(null)).toEqual([]);
  });

  it("keeps the producer's F2F workflow reachable, inside protocol context", () => {
    const actor = asPersona("DEMO-FARM-001");
    const modules = visibleProtocolModuleRoutes(actor, F2F_PROTOCOL_ID).map((r) =>
      r.href.kind === "STATIC" ? r.href.path : r.href.pattern,
    );
    for (const path of ["/fields", "/contracts", "/monitoring", "/documents", "/finance"]) {
      expect(modules, `producer needs ${path}`).toContain(path);
    }
    expect(protocolContextsForActor(actor)).toEqual([F2F_PROTOCOL_ID]);
  });

  it("scopes organisation-gated modules to the matching organisation type", () => {
    // SCAS verification is guarded by requireScasVerifier (organisation type SCAS).
    const scas = asPersona("DEMO-SCAS-001");
    const registrar = asPersona("DEMO-REGISTRAR-001");
    const scasPaths = visibleProtocolModuleRoutes(scas, F2F_PROTOCOL_ID).map((r) =>
      r.href.kind === "STATIC" ? r.href.path : "",
    );
    const registrarPaths = visibleProtocolModuleRoutes(registrar, F2F_PROTOCOL_ID).map(
      (r) => (r.href.kind === "STATIC" ? r.href.path : ""),
    );
    expect(scasPaths).toContain("/scas/verification");
    expect(registrarPaths).not.toContain("/scas/verification");
    expect(registrarPaths).toContain("/registrar/intake");
    expect(scasPaths).not.toContain("/registrar/intake");
  });

  it("hides organisation-gated modules from a permission-matching wrong-org actor", () => {
    // The registrar intake guard requires organisation type REGISTRAR in
    // addition to the permission pair. An ISSUER holds the same permissions.
    const issuer = asPersona("DEMO-ISSUER-001");
    const intake = ROUTE_REGISTRY.find((r) => r.id === "f2f-registrar-intake")!;
    expect(actorCan(issuer, "issuance.manage")).toBe(true);
    expect(issuer.effective.organization?.type).toBe("ISSUER");
    expect(routeVisibleTo(issuer, intake)).toBe(false);
  });

  it("keeps the unimpersonated administrator on the system workspace", () => {
    const actor = resolveActorContext({
      principal: adminPrincipal(),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    const hrefs = visibleNavigationHrefs(actor);
    expect(hrefs).toContain("/admin");
    for (const path of AGRICULTURE_PATHS) {
      expect(hrefs).not.toContain(path);
    }
    expect(protocolContextsForActor(actor)).toEqual([]);
  });

  it("grants no persona a destination its visibility rule denies", () => {
    for (const personaId of personaIds) {
      const actor = asPersona(personaId);
      for (const entry of navigationForActor(actor).flatMap((s) => s.entries)) {
        const route = ROUTE_REGISTRY.find((r) => r.id === entry.id)!;
        expect(routeVisibleTo(actor, route), `${personaId} ${entry.id}`).toBe(true);
      }
    }
  });

  it("never surfaces a protocol module through the global selector", () => {
    for (const personaId of personaIds) {
      const actor = asPersona(personaId);
      for (const route of visibleGlobalRoutes(actor)) {
        expect(isProtocolModuleRoute(route), `${personaId} ${route.id}`).toBe(false);
      }
    }
  });
});
