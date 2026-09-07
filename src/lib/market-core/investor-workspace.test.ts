import { describe, expect, it } from "vitest";
import {
  actorMayCancelOrder,
  explainActorEligibility,
  explanationAllowsTrade,
  type EligibilityExplanation,
  type Holding,
  type MarketInstrument,
  type Order,
  type OrderReservation,
  type ProtocolVersion,
  type Trade,
} from "@/domain/market-core";
import {
  DEMO_ORGANIZATIONS,
  demoMembershipForPersona,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import {
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
  holdings,
  instrumentById,
  marketForInstrument,
  protocolById,
  protocolVersions,
  shippedEligibilityRegistryInput,
} from "@/data/market-core/catalog";
import {
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import { HOLDING_BUCKETS, holdingBucketValues } from "./instrument-shell";
import {
  composeInvestorWorkspace,
  resolveInvestorWorkspaceScope,
  scopeMarketActivity,
  type InvestorWorkspaceCanonicalSource,
  type InvestorWorkspaceReady,
} from "./investor-workspace";
import {
  lifecycleClaimsSettlementFinality,
  presentWorkspaceEligibility,
  presentWorkspaceExecution,
  presentWorkspaceOrder,
  workspaceOrderStatusKey,
  workspaceTradeLifecycleKey,
} from "./investor-workspace-presentation";
import { investorWorkspaceCanonicalSource } from "@/services/investor-workspace";

const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;
const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
const wheatMarket = marketForInstrument(WHEAT_INSTRUMENT_ID)!;
const wheatProtocol = protocolById(wheat.assetProtocolId)!;

function membership(
  overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "admin-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function asPersona(personaId: string): ActorContext {
  const persona = demoPersonaById(personaId)!;
  const organization = organizationById(persona.organizationId)!;
  const principal = buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    status: "ACTIVE",
    organizations: [platform, organization],
    memberships: [
      membership({
        userId: "admin-1",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
  });
  return resolveActorContext({
    principal,
    session: { principalUserId: "admin-1", effectiveDemoPersonaId: persona.id },
    persona,
    personaOrganization: organization,
  });
}

function unimpersonatedAdmin(): ActorContext {
  const principal = buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
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
  return resolveActorContext({
    principal,
    session: { principalUserId: "admin-1" },
    persona: undefined,
    personaOrganization: undefined,
  });
}

function emptyExplanation(state: EligibilityExplanation["state"]): EligibilityExplanation {
  return {
    participantReference: "INVESTOR-0001",
    instrumentId: WHEAT_INSTRUMENT_ID,
    state,
    organizationId: null,
    membershipId: null,
    assessmentId: null,
    reasonCode: null,
    authorityRole: null,
    evidenceRefs: [],
    recordedAt: null,
    missing: [],
    inconsistencies: [],
    attributionComplete: true,
  };
}

function openOrder(partial: Partial<Order> & Pick<Order, "id" | "participantId">): Order {
  return {
    marketId: wheatMarket.id,
    instrumentId: WHEAT_INSTRUMENT_ID,
    side: "SELL",
    orderType: "LIMIT",
    price: 105000,
    originalQuantity: 2,
    remainingQuantity: 2,
    filledQuantity: 0,
    status: "OPEN",
    sequence: 1,
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T10:00:00.000Z",
    sourceChannel: "DIRECT_MTP",
    ...partial,
  };
}

function reservation(
  partial: Partial<OrderReservation> & Pick<OrderReservation, "id" | "orderId" | "participantId">,
): OrderReservation {
  return {
    marketId: wheatMarket.id,
    instrumentId: WHEAT_INSTRUMENT_ID,
    kind: "ASSET",
    quantity: 2,
    status: "ACTIVE",
    ...partial,
  };
}

function trade(partial: Partial<Trade> & Pick<Trade, "id">): Trade {
  return {
    marketId: wheatMarket.id,
    instrumentId: WHEAT_INSTRUMENT_ID,
    buyOrderId: "buy-1",
    sellOrderId: "sell-1",
    buyerParticipantId: "GRAIN-DESK",
    sellerParticipantId: "INVESTOR-0001",
    quantity: 2,
    price: 105000,
    notional: 210000,
    status: "AWAITING_DEVNET_SETTLEMENT",
    kind: "SECONDARY",
    createdAt: "2026-08-23T10:01:00.000Z",
    updatedAt: "2026-08-23T10:01:00.000Z",
    eligibilityRecheckPassed: true,
    dvpStatus: "PENDING",
    registryUpdateStatus: "PENDING",
    finalSettlementStatus: "PENDING",
    ...partial,
  };
}

function composeFor(
  actor: ActorContext,
  options: {
    canonical?: InvestorWorkspaceCanonicalSource;
    activity?: Parameters<typeof composeInvestorWorkspace>[0]["activity"];
  } = {},
) {
  return composeInvestorWorkspace({
    actor,
    canonical: options.canonical ?? investorWorkspaceCanonicalSource(),
    activity: options.activity ?? { kind: "UNAVAILABLE" },
    navigation: { secondaryHref: "/secondary", marketsHref: "/markets" },
  });
}

function asWorkspace(model: ReturnType<typeof composeFor>): InvestorWorkspaceReady {
  expect(model.kind).toBe("WORKSPACE");
  return model as InvestorWorkspaceReady;
}

describe("investor workspace actor scoping", () => {
  it("resolves DEMO-FUND-001 to INVESTOR-0001 through effective identity", () => {
    const actor = asPersona("DEMO-FUND-001");
    const scope = resolveInvestorWorkspaceScope(actor);
    expect(scope.kind).toBe("SCOPED");
    if (scope.kind !== "SCOPED") {
      return;
    }
    expect(scope.participantId).toBe("INVESTOR-0001");
    expect(scope.organizationName).toBe("Steppe Capital");
    expect(scope.membershipId).toBe(demoMembershipForPersona("DEMO-FUND-001")?.id);
    expect(actor.isImpersonating).toBe(true);
    expect(actor.principal.roleIds).toContain("SYSTEM_ADMIN");
    expect(actor.effective.roleId).toBe("INVESTOR");
  });

  it("does not leak registrar or grain-desk holdings to the fund participant", () => {
    const workspace = asWorkspace(composeFor(asPersona("DEMO-FUND-001")));
    const holderIds = workspace.protocolGroups.flatMap((group) =>
      group.instruments.map((row) => row.holdingId),
    );
    const catalogIds = holdings
      .filter((row) => row.holderReference === "INVESTOR-0001")
      .map((row) => row.id);
    expect(holderIds).toEqual(catalogIds);
    expect(holderIds).not.toContain("hld-registrar-wheat");
    expect(holderIds).not.toContain("hld-grain-desk-wheat");
    expect(holdings.some((row) => row.holderReference === "GRAIN-DESK")).toBe(true);
  });

  it("does not leak another participant's orders or trades", () => {
    const workspace = asWorkspace(
      composeFor(asPersona("DEMO-FUND-001"), {
        activity: {
          kind: "AVAILABLE",
          orders: [
            openOrder({ id: "ord-steppe", participantId: "INVESTOR-0001" }),
            openOrder({ id: "ord-grain", participantId: "GRAIN-DESK" }),
            openOrder({ id: "ord-missing", participantId: "" }),
          ],
          reservations: [
            reservation({
              id: "res-steppe",
              orderId: "ord-steppe",
              participantId: "INVESTOR-0001",
            }),
            reservation({
              id: "res-grain",
              orderId: "ord-grain",
              participantId: "GRAIN-DESK",
            }),
          ],
          trades: [
            trade({ id: "tr-own", sellerParticipantId: "INVESTOR-0001" }),
            trade({
              id: "tr-other",
              sellerParticipantId: "REGISTRAR",
              buyerParticipantId: "GRAIN-DESK",
            }),
          ],
          workingHoldings: [],
        },
      }),
    );
    expect(workspace.orders).not.toHaveProperty("unavailable");
    if ("unavailable" in workspace.orders || "unavailable" in workspace.executions) {
      return;
    }
    expect(workspace.orders.map((row) => row.id)).toEqual(["ord-steppe"]);
    expect(workspace.orders[0]?.reservation?.id).toBe("res-steppe");
    expect(workspace.executions.map((row) => row.id)).toEqual(["tr-own"]);
  });

  it("fails closed when participant attribution is missing or inconsistent", () => {
    expect(resolveInvestorWorkspaceScope(unimpersonatedAdmin()).kind).toBe("DENIED");
    const fund = asPersona("DEMO-FUND-001");
    const grainOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "grain-desk")!;
    const inconsistent: ActorContext = {
      ...fund,
      effective: {
        ...fund.effective,
        organization: grainOrg,
      },
    };
    const denied = composeFor(inconsistent);
    expect(denied).toEqual({ kind: "DENIED", reason: "INCONSISTENT_ATTRIBUTION" });

    const noMembership: ActorContext = {
      ...fund,
      effective: { ...fund.effective, membershipId: null },
    };
    expect(composeFor(noMembership)).toEqual({
      kind: "DENIED",
      reason: "MISSING_MEMBERSHIP",
    });
  });

  it("denies unimpersonated SYSTEM_ADMIN and scopes impersonation to the persona", () => {
    const admin = unimpersonatedAdmin();
    expect(admin.isImpersonating).toBe(false);
    expect(composeFor(admin)).toEqual({
      kind: "DENIED",
      reason: "UNIMPERSONATED_ADMIN",
    });
    const impersonated = asWorkspace(composeFor(asPersona("DEMO-FUND-001")));
    expect(impersonated.participantId).toBe("INVESTOR-0001");
    expect(impersonated.participantId).not.toBe(admin.principal.userId);
  });
});

describe("investor workspace holdings and grouping", () => {
  it("groups holdings protocol then instrument and keeps five buckets distinct", () => {
    const workspace = asWorkspace(composeFor(asPersona("DEMO-FUND-001")));
    expect(workspace.protocolGroups).toHaveLength(1);
    expect(workspace.protocolGroups[0]?.protocolId).toBe(wheatProtocol.id);
    expect(workspace.protocolGroups[0]?.instruments).toHaveLength(1);
    const row = workspace.protocolGroups[0]?.instruments[0];
    const catalog = holdings.find((item) => item.holderReference === "INVESTOR-0001")!;
    const expected = holdingBucketValues(catalog);
    expect(row?.instrumentId).toBe(WHEAT_INSTRUMENT_ID);
    expect(row?.instrumentHref).toBe(`/instruments/${WHEAT_INSTRUMENT_ID}`);
    expect(row?.buckets).toEqual(expected);
    expect(Object.keys(row!.buckets)).toEqual([
      "owned",
      "available",
      "reserved",
      "pledged",
      "blocked",
    ]);
    expect(HOLDING_BUCKETS.map((bucket) => bucket.id)).toEqual([
      "owned",
      "available",
      "reserved",
      "pledged",
      "blocked",
    ]);
    expect(row?.buckets.reserved).toBe(catalog.buckets.reservedForOrders);
    expect(row?.buckets.pledged).toBe(catalog.buckets.pledged);
    expect(row?.buckets.blocked).toBe(catalog.buckets.blocked);
    expect(
      workspace.protocolGroups.flatMap((group) => group.instruments).map((item) => item.instrumentId),
    ).not.toContain(F2F_PROTOCOL_INVESTMENT_ID);
  });

  it("does not fall back to a protocol current version for an unbound instrument", () => {
    const unbound: MarketInstrument = {
      ...wheat,
      id: "UNBOUND-1",
      symbol: "UNBOUND-1",
      protocolVersionId: null,
    };
    const discovery: ProtocolVersion = {
      ...protocolVersions[0]!,
      id: "DISCOVERY-CURRENT",
    };
    const holding: Holding = {
      id: "hld-unbound",
      instrumentId: "UNBOUND-1",
      holderReference: "INVESTOR-0001",
      holderName: "Steppe Capital",
      buckets: {
        owned: 3,
        reservedForOrders: 1,
        pledged: 1,
        blocked: 1,
        pendingIn: 0,
        pendingOut: 0,
      },
      available: 1,
    };
    const source = investorWorkspaceCanonicalSource();
    const workspace = asWorkspace(
      composeFor(asPersona("DEMO-FUND-001"), {
        canonical: {
          ...source,
          listHoldings: () => [holding],
          getInstrumentMarketContext: () => ({
            instrument: unbound,
            protocol: wheatProtocol,
            market: wheatMarket,
            protocolVersion: discovery,
          }),
          explainActorEligibility: () => emptyExplanation("NOT_ASSESSED"),
          actorMaySubmitOrder: () => false,
        },
      }),
    );
    const row = workspace.protocolGroups[0]?.instruments[0];
    expect(row?.protocolVersionId).toBeNull();
    expect(row?.protocolVersionHref).toBeUndefined();
    expect(row?.buckets).toEqual({
      owned: 3,
      available: 1,
      reserved: 1,
      pledged: 1,
      blocked: 1,
    });
  });
});

describe("investor workspace eligibility and cancellation", () => {
  it("reuses the production eligibility explanation for the held instrument", () => {
    const actor = asPersona("DEMO-FUND-001");
    const workspace = asWorkspace(composeFor(actor));
    const row = workspace.eligibility[0];
    const expected = explainActorEligibility(actor, {
      participantReference: "INVESTOR-0001",
      instrumentId: WHEAT_INSTRUMENT_ID,
      ...shippedEligibilityRegistryInput(),
    });
    expect(row?.explanation.state).toBe(expected.state);
    expect(row?.explanation.assessmentId).toBe(expected.assessmentId);
    expect(row?.explanation).toEqual(expected);
    const presented = presentWorkspaceEligibility(row!);
    expect(presented.eligibility.stateKey).toBe("stateEligible");
    expect(presented.admission.kind).toBe("ALLOWED");
    expect(row?.canSubmitNewOrder).toBe(true);
    expect(explanationAllowsTrade(row!.explanation)).toBe(true);
  });

  it("distinguishes eligible, ineligible, not assessed and policy-pending new-order readiness", () => {
    const cases: Array<EligibilityExplanation["state"]> = [
      "ELIGIBLE",
      "NOT_ELIGIBLE",
      "NOT_ASSESSED",
      "POLICY_PENDING",
    ];
    const source = investorWorkspaceCanonicalSource();
    for (const state of cases) {
      const workspace = asWorkspace(
        composeFor(asPersona("DEMO-FUND-001"), {
          canonical: {
            ...source,
            explainActorEligibility: () => emptyExplanation(state),
            actorMaySubmitOrder: () => state === "ELIGIBLE",
          },
        }),
      );
      const presented = presentWorkspaceEligibility(workspace.eligibility[0]!);
      expect(presented.eligibility.state).toBe(state);
      expect(presented.admission.kind === "ALLOWED").toBe(state === "ELIGIBLE");
      expect(presented.cancellationIndependentOfEligibility).toBe(true);
    }
  });

  it("does not couple owned-order cancellation to current eligibility", () => {
    const order = openOrder({ id: "ord-owned", participantId: "INVESTOR-0001" });
    const source = investorWorkspaceCanonicalSource();
    const workspace = asWorkspace(
      composeFor(asPersona("DEMO-FUND-001"), {
        canonical: {
          ...source,
          explainActorEligibility: () => emptyExplanation("NOT_ELIGIBLE"),
          actorMaySubmitOrder: () => false,
          actorMayCancelOrder: (input) => actorMayCancelOrder(input),
        },
        activity: {
          kind: "AVAILABLE",
          orders: [order],
          reservations: [
            reservation({
              id: "res-owned",
              orderId: "ord-owned",
              participantId: "INVESTOR-0001",
            }),
          ],
          trades: [],
          workingHoldings: [],
        },
      }),
    );
    expect(workspace.eligibility[0]?.canSubmitNewOrder).toBe(false);
    expect("unavailable" in workspace.orders).toBe(false);
    if ("unavailable" in workspace.orders) {
      return;
    }
    expect(workspace.orders[0]?.mayCancel).toBe(true);
    expect(workspace.eligibility[0]?.cancellationIndependentOfEligibility).toBe(true);
  });
});

describe("investor workspace orders, reservations and executions", () => {
  it("shows open and partially filled orders with reservation linkage", () => {
    const workspace = asWorkspace(
      composeFor(asPersona("DEMO-FUND-001"), {
        activity: {
          kind: "AVAILABLE",
          orders: [
            openOrder({ id: "ord-open", participantId: "INVESTOR-0001", status: "OPEN" }),
            openOrder({
              id: "ord-partial",
              participantId: "INVESTOR-0001",
              status: "PARTIALLY_FILLED",
              remainingQuantity: 1,
              filledQuantity: 1,
            }),
            openOrder({
              id: "ord-filled",
              participantId: "INVESTOR-0001",
              status: "FILLED",
              remainingQuantity: 0,
              filledQuantity: 2,
            }),
          ],
          reservations: [
            reservation({
              id: "res-open",
              orderId: "ord-open",
              participantId: "INVESTOR-0001",
              status: "ACTIVE",
            }),
            reservation({
              id: "res-partial",
              orderId: "ord-partial",
              participantId: "INVESTOR-0001",
              status: "HELD_PENDING_SETTLEMENT",
            }),
          ],
          trades: [],
          workingHoldings: [],
        },
      }),
    );
    if ("unavailable" in workspace.orders) {
      throw new Error("orders should be available");
    }
    expect(workspace.orders.map((row) => row.id)).toEqual(["ord-open", "ord-partial"]);
    expect(workspace.orders[0]?.reservation?.status).toBe("ACTIVE");
    expect(workspace.orders[1]?.reservation?.status).toBe("HELD_PENDING_SETTLEMENT");
    expect(workspace.overview.openOrderCount).toBe(2);
    expect(workspace.overview.reservationsRequiringAttention).toBe(2);
    expect(presentWorkspaceOrder(workspace.orders[0]!).statusKey).toBe("orderStatusOpen");
    expect(workspaceOrderStatusKey("FILLED")).toBe("orderStatusUnavailable");
  });

  it("records trade clearing lifecycle without claiming settlement finality", () => {
    const workspace = asWorkspace(
      composeFor(asPersona("DEMO-FUND-001"), {
        activity: {
          kind: "AVAILABLE",
          orders: [],
          reservations: [],
          trades: [
            trade({ id: "tr-1", status: "MATCHED", createdAt: "2026-08-23T10:00:00.000Z" }),
            trade({
              id: "tr-2",
              status: "CLEARING_READY",
              createdAt: "2026-08-23T10:01:00.000Z",
            }),
            trade({
              id: "tr-3",
              status: "AWAITING_DEVNET_SETTLEMENT",
              createdAt: "2026-08-23T10:02:00.000Z",
            }),
          ],
          workingHoldings: [],
        },
      }),
    );
    if ("unavailable" in workspace.executions) {
      throw new Error("executions should be available");
    }
    expect(workspace.executions.map((row) => row.status)).toEqual([
      "AWAITING_DEVNET_SETTLEMENT",
      "CLEARING_READY",
      "MATCHED",
    ]);
    for (const row of workspace.executions) {
      const presented = presentWorkspaceExecution(row);
      expect(presented.claimsSettlementFinality).toBe(false);
      expect(lifecycleClaimsSettlementFinality(row.status)).toBe(false);
      expect(presented.lifecycleKey).not.toBe("SETTLED");
    }
    expect(workspaceTradeLifecycleKey("SETTLED")).toBe("lifecycleUnavailable");
    expect(workspace.overview.executionsByLifecycle).toEqual([
      { status: "MATCHED", count: 1 },
      { status: "CLEARING_READY", count: 1 },
      { status: "AWAITING_DEVNET_SETTLEMENT", count: 1 },
    ]);
  });

  it("does not calculate a monetary portfolio aggregate", () => {
    const workspace = asWorkspace(
      composeFor(asPersona("DEMO-FUND-001"), {
        activity: {
          kind: "AVAILABLE",
          orders: [openOrder({ id: "ord-open", participantId: "INVESTOR-0001" })],
          reservations: [],
          trades: [trade({ id: "tr-1" })],
          workingHoldings: [],
        },
      }),
    );
    expect(workspace.overview).not.toHaveProperty("marketValue");
    expect(workspace.overview).not.toHaveProperty("nav");
    expect(workspace.overview).not.toHaveProperty("pnl");
    expect(workspace).not.toHaveProperty("cashBalance");
    const serialized = JSON.stringify(workspace);
    expect(serialized).not.toMatch(/portfolioValue|unrealized|yield|IRR|withdrawable/i);
    if ("unavailable" in workspace.orders || "unavailable" in workspace.executions) {
      return;
    }
    const holdingQty = workspace.protocolGroups[0]?.instruments[0]?.buckets.owned ?? 0;
    const orderPrice = workspace.orders[0]?.limitPrice ?? 0;
    expect(workspace.overview.instrumentCount).not.toBe(holdingQty * orderPrice);
  });

  it("keeps holdings when the live book is unavailable", () => {
    const workspace = asWorkspace(composeFor(asPersona("DEMO-FUND-001")));
    expect(workspace.activityProvenance).toBe("UNAVAILABLE");
    expect(workspace.holdingsProvenance).toBe("CANONICAL_REGISTER");
    expect(workspace.orders).toEqual({ unavailable: true });
    expect(workspace.executions).toEqual({ unavailable: true });
    expect(workspace.protocolGroups[0]?.instruments[0]?.instrumentId).toBe(
      WHEAT_INSTRUMENT_ID,
    );
  });
});

describe("scopeMarketActivity", () => {
  it("drops unattributed rows instead of assigning them", () => {
    const scoped = scopeMarketActivity(
      {
        orders: [
          openOrder({ id: "a", participantId: "INVESTOR-0001" }),
          openOrder({ id: "b", participantId: "" }),
        ],
        reservations: [],
        trades: [],
        holdings,
      },
      "INVESTOR-0001",
    );
    expect(scoped.orders.map((row) => row.id)).toEqual(["a"]);
    expect(scoped.workingHoldings.every((row) => row.holderReference === "INVESTOR-0001")).toBe(
      true,
    );
  });
});
