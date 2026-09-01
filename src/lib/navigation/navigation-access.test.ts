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
import { F2F_PROTOCOL_ID, protocolById } from "@/data/market-core/catalog";
import {
  navigationForActor,
  protocolContextsForActor,
  protocolModuleTrailAccess,
  routeVisibleTo,
  visibleGlobalRoutes,
  visibleNavigationHrefs,
  visibleProtocolModuleRoutes,
} from "@/lib/navigation/policy";
import { protocolModuleTrail } from "@/lib/market-core/hierarchy";
import {
  ROUTE_REGISTRY,
  isProtocolModuleRoute,
  routeById,
  routeHrefMatchesPath,
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

  it("never surfaces a protocol module through the global selector", () => {
    for (const personaId of personaIds) {
      const actor = asPersona(personaId);
      for (const route of visibleGlobalRoutes(actor)) {
        expect(isProtocolModuleRoute(route), `${personaId} ${route.id}`).toBe(false);
      }
    }
  });
});

function linkedTrailHrefs(moduleLabel: string, actor: ActorContext): string[] {
  const protocol = protocolById(F2F_PROTOCOL_ID)!;
  return protocolModuleTrail(protocol, moduleLabel, protocolModuleTrailAccess(actor))
    .map((crumb) => crumb.href)
    .filter((href): href is string => Boolean(href));
}

function productionPolicyAllowsHref(actor: ActorContext, href: string): boolean {
  return ROUTE_REGISTRY.some(
    (route) => routeHrefMatchesPath(route, href) && routeVisibleTo(actor, route),
  );
}

describe("protocol-module breadcrumb links × production policy", () => {
  it("derives catalogue link eligibility from the production registry", () => {
    const producer = asPersona("DEMO-FARM-001");
    const scas = asPersona("DEMO-SCAS-001");
    const issuer = asPersona("DEMO-ISSUER-001");
    const protocols = routeById("protocols")!;
    const detail = routeById("protocol-detail")!;
    expect(protocolModuleTrailAccess(producer)).toEqual({
      protocolsCollection: false,
      protocolDetail: false,
    });
    expect(protocolModuleTrailAccess(scas)).toEqual({
      protocolsCollection: false,
      protocolDetail: false,
    });
    expect(protocolModuleTrailAccess(issuer)).toEqual({
      protocolsCollection: true,
      protocolDetail: true,
    });
    expect(routeVisibleTo(producer, protocols)).toBe(false);
    expect(routeVisibleTo(scas, protocols)).toBe(false);
    expect(routeVisibleTo(issuer, protocols)).toBe(true);
    expect(routeVisibleTo(issuer, detail)).toBe(true);
  });

  it("shows Producer protocol crumbs as labels only", () => {
    const actor = asPersona("DEMO-FARM-001");
    const protocol = protocolById(F2F_PROTOCOL_ID)!;
    const trail = protocolModuleTrail(
      protocol,
      "Fields",
      protocolModuleTrailAccess(actor),
    );
    expect(trail.map((crumb) => crumb.label ?? crumb.labelKey)).toEqual([
      "breadcrumbPlatform",
      "protocolsTitle",
      protocol.name,
      "Fields",
    ]);
    expect(trail[1]?.href).toBeUndefined();
    expect(trail[2]?.href).toBeUndefined();
    expect(trail[3]?.href).toBeUndefined();
    expect(trail[0]?.href).toBe("/");
  });

  it("shows SCAS protocol crumbs as labels only on operational screens", () => {
    const actor = asPersona("DEMO-SCAS-001");
    const protocol = protocolById(F2F_PROTOCOL_ID)!;
    for (const label of ["Attestation", "Coverage", "Pools"]) {
      const trail = protocolModuleTrail(
        protocol,
        label,
        protocolModuleTrailAccess(actor),
      );
      expect(trail[1]?.href, label).toBeUndefined();
      expect(trail[2]?.href, label).toBeUndefined();
      expect(trail.some((crumb) => crumb.label === protocol.name)).toBe(true);
      expect(trail.some((crumb) => crumb.label === label)).toBe(true);
    }
  });

  it("keeps protocol catalogue links for a persona that can open them", () => {
    const actor = asPersona("DEMO-ISSUER-001");
    const protocol = protocolById(F2F_PROTOCOL_ID)!;
    const trail = protocolModuleTrail(
      protocol,
      "Coverage",
      protocolModuleTrailAccess(actor),
    );
    expect(trail[1]?.href).toBe("/protocols");
    expect(trail[2]?.href).toBe(`/protocols/${protocol.id}`);
  });

  it("offers off-spine personas only breadcrumb hrefs the production policy can show", () => {
    const cases: Array<[string, string]> = [
      ["DEMO-FARM-001", "Fields"],
      ["DEMO-SCAS-001", "Attestation"],
      ["DEMO-SCAS-001", "Coverage"],
      ["DEMO-SCAS-001", "Pools"],
      ["DEMO-ISSUER-001", "Coverage"],
      ["DEMO-REGISTRAR-001", "Backing"],
    ];
    for (const [personaId, moduleLabel] of cases) {
      const actor = asPersona(personaId);
      for (const href of linkedTrailHrefs(moduleLabel, actor)) {
        expect(
          productionPolicyAllowsHref(actor, href),
          `${personaId} breadcrumb ${href}`,
        ).toBe(true);
      }
    }
  });

  it("does not require a duplicate placement route in a non-agriculture context", () => {
    const issuer = asPersona("DEMO-ISSUER-001");
    const registrar = asPersona("DEMO-REGISTRAR-001");
    const investor = asPersona("DEMO-FUND-001");
    expect(
      visibleProtocolModuleRoutes(issuer, "TIDAL").map((route) =>
        route.href.kind === "STATIC" ? route.href.path : route.href.pattern,
      ),
    ).not.toContain("/placements");
    expect(
      visibleGlobalRoutes(issuer).some((route) =>
        routeHrefMatchesPath(route, "/placements"),
      ),
    ).toBe(true);
    expect(
      visibleGlobalRoutes(registrar).some((route) =>
        routeHrefMatchesPath(route, "/placements"),
      ),
    ).toBe(true);
    expect(
      visibleGlobalRoutes(investor).some((route) =>
        routeHrefMatchesPath(route, "/placements"),
      ),
    ).toBe(true);
  });

  it("does not grant market.trade when read-only market destinations were widened", () => {
    for (const personaId of [
      "DEMO-ISSUER-001",
      "DEMO-REGISTRAR-001",
      "DEMO-REGULATOR-001",
      "DEMO-SCAS-001",
    ]) {
      const actor = asPersona(personaId);
      expect(actorCan(actor, "market.trade"), personaId).toBe(false);
    }
    expect(visibleNavigationHrefs(asPersona("DEMO-ISSUER-001"))).toEqual(
      expect.arrayContaining(["/markets", "/instruments", "/secondary", "/protocols"]),
    );
    expect(visibleNavigationHrefs(asPersona("DEMO-REGISTRAR-001"))).toEqual(
      expect.arrayContaining(["/secondary", "/instruments", "/protocols"]),
    );
    expect(visibleNavigationHrefs(asPersona("DEMO-REGULATOR-001"))).toEqual(
      expect.arrayContaining(["/secondary", "/instruments", "/protocols"]),
    );
    expect(visibleNavigationHrefs(asPersona("DEMO-SCAS-001"))).toContain("/instruments");
    expect(visibleNavigationHrefs(asPersona("DEMO-SCAS-001"))).not.toContain("/secondary");
  });
});
