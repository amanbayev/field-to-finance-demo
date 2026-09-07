import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import {
  buildPrincipal,
  resolveActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import { holdings } from "@/data/market-core/catalog";
import * as repository from "./secondary-market-repository";
import { getInvestorWorkspace } from "./investor-workspace";

vi.mock("./secondary-market-repository", () => ({
  fetchPersistentEngineState: vi.fn(),
}));

const fetchPersistentEngineState = vi.mocked(repository.fetchPersistentEngineState);
const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;

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

function asPersona(personaId: string) {
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

describe("getInvestorWorkspace", () => {
  beforeEach(() => {
    fetchPersistentEngineState.mockReset();
  });

  it("renders holdings when the live book is unavailable", async () => {
    fetchPersistentEngineState.mockRejectedValue(new Error("MARKET_CORE_UNAVAILABLE"));
    const workspace = await getInvestorWorkspace(asPersona("DEMO-FUND-001"));
    expect(workspace.kind).toBe("WORKSPACE");
    if (workspace.kind !== "WORKSPACE") {
      return;
    }
    expect(workspace.activityProvenance).toBe("UNAVAILABLE");
    expect(workspace.orders).toEqual({ unavailable: true });
    expect(workspace.executions).toEqual({ unavailable: true });
    expect(workspace.protocolGroups[0]?.instruments[0]?.holdingId).toBe(
      holdings.find((row) => row.holderReference === "INVESTOR-0001")?.id,
    );
  });

  it("scopes a live snapshot to the effective participant before composition", async () => {
    fetchPersistentEngineState.mockResolvedValue({
      now: "2026-08-23T10:00:00.000Z",
      nextOrderSeq: 1,
      nextOrderId: 1,
      nextTradeId: 1,
      nextReservationId: 1,
      nextSettlementId: 1,
      nextEventId: 1,
      markets: [],
      instruments: [],
      orders: [
        {
          id: "ord-steppe",
          marketId: "m",
          instrumentId: "TIDE-2030",
          participantId: "INVESTOR-0001",
          side: "SELL",
          orderType: "LIMIT",
          price: 1,
          originalQuantity: 1,
          remainingQuantity: 1,
          filledQuantity: 0,
          status: "OPEN",
          sequence: 1,
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
          sourceChannel: "DIRECT_MTP",
        },
        {
          id: "ord-grain",
          marketId: "m",
          instrumentId: "TIDE-2030",
          participantId: "GRAIN-DESK",
          side: "BUY",
          orderType: "LIMIT",
          price: 1,
          originalQuantity: 1,
          remainingQuantity: 1,
          filledQuantity: 0,
          status: "OPEN",
          sequence: 2,
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
          sourceChannel: "DIRECT_MTP",
        },
      ],
      reservations: [],
      trades: [],
      settlements: [],
      holdings: [],
      eligibility: [],
      settlementAccounts: [],
      events: [],
    });
    const workspace = await getInvestorWorkspace(asPersona("DEMO-FUND-001"));
    expect(workspace.kind).toBe("WORKSPACE");
    if (workspace.kind !== "WORKSPACE" || "unavailable" in workspace.orders) {
      return;
    }
    expect(workspace.orders.map((row) => row.id)).toEqual(["ord-steppe"]);
  });
});
