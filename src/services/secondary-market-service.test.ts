import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actorCan,
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import {
  WHEAT_DEMO_MARKET_ID,
  type EngineState,
  type InstrumentEligibilityState,
  type Order,
} from "@/domain/market-core";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import { WHEAT_INSTRUMENT_ID } from "@/data/market-core/catalog";
import { wheatEngineBaseState } from "@/data/market-core/seed-scenario";

vi.mock("@/services/secondary-market-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/secondary-market-repository")>();
  return {
    ...actual,
    fetchPersistentEngineState: vi.fn(),
    rpcCancelOrder: vi.fn(),
    rpcSubmitLimitOrder: vi.fn(),
  };
});

import * as repository from "@/services/secondary-market-repository";
import {
  cancelSecondaryOrder,
  submitSecondaryOrder,
} from "@/services/secondary-market-service";

const fetchPersistentEngineState = vi.mocked(repository.fetchPersistentEngineState);
const rpcCancelOrder = vi.mocked(repository.rpcCancelOrder);
const rpcSubmitLimitOrder = vi.mocked(repository.rpcSubmitLimitOrder);

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

function adminPrincipal() {
  return buildPrincipal({
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

function unimpersonatedAdmin(): ActorContext {
  return resolveActorContext({
    principal: adminPrincipal(),
    session: null,
    persona: undefined,
    personaOrganization: undefined,
  });
}

function openSteppeOrder(status: Order["status"] = "OPEN"): Order {
  return {
    id: "ORD-OPEN-STEPPE-001",
    marketId: WHEAT_DEMO_MARKET_ID,
    instrumentId: WHEAT_INSTRUMENT_ID,
    participantId: "INVESTOR-0001",
    side: "SELL",
    orderType: "LIMIT",
    price: 105000,
    originalQuantity: 2,
    remainingQuantity: status === "OPEN" || status === "PARTIALLY_FILLED" ? 2 : 0,
    filledQuantity: status === "PARTIALLY_FILLED" || status === "FILLED" ? 1 : 0,
    status,
    sequence: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    sourceChannel: "DIRECT_MTP",
  };
}

function stateWithOwnedOrder(
  eligibilityState: InstrumentEligibilityState,
  order: Order = openSteppeOrder(),
): EngineState {
  const base = wheatEngineBaseState();
  return {
    ...base,
    eligibility: base.eligibility.map((row) =>
      row.participantReference === "INVESTOR-0001" && row.instrumentId === WHEAT_INSTRUMENT_ID
        ? { ...row, state: eligibilityState }
        : row,
    ),
    orders: [order],
  };
}

describe("cancelSecondaryOrder after eligibility loss", () => {
  beforeEach(() => {
    fetchPersistentEngineState.mockReset();
    rpcCancelOrder.mockReset();
    rpcSubmitLimitOrder.mockReset();
    rpcCancelOrder.mockResolvedValue({ ok: true, error: null });
    rpcSubmitLimitOrder.mockResolvedValue({ ok: true, error: null, orderId: "ORD-NEW" });
  });

  it.each([
    "NOT_ELIGIBLE",
    "NOT_ASSESSED",
    "POLICY_PENDING",
  ] as const)("reaches the cancellation RPC when eligibility is %s", async (state) => {
    const snapshot = stateWithOwnedOrder(state);
    fetchPersistentEngineState.mockResolvedValue(snapshot);
    const actor = asPersona("DEMO-FUND-001");

    const submitted = await submitSecondaryOrder({
      actor,
      side: "SELL",
      price: 105000,
      quantity: 1,
      idempotencyKey: "submit-denied",
    });
    expect(submitted.error).toBe("INELIGIBLE");
    expect(rpcSubmitLimitOrder).not.toHaveBeenCalled();

    const cancelled = await cancelSecondaryOrder({
      actor,
      orderId: "ORD-OPEN-STEPPE-001",
      idempotencyKey: "cancel-after-loss",
    });
    expect(cancelled.error).toBeNull();
    expect(rpcCancelOrder).toHaveBeenCalledWith({
      orderId: "ORD-OPEN-STEPPE-001",
      idempotencyKey: "cancel-after-loss",
    });
  });

  it("reaches the cancellation RPC after an eligibility overlay mismatch", async () => {
    const snapshot = stateWithOwnedOrder("NOT_ELIGIBLE");
    fetchPersistentEngineState.mockResolvedValue(snapshot);
    const result = await cancelSecondaryOrder({
      actor: asPersona("DEMO-FUND-001"),
      orderId: "ORD-OPEN-STEPPE-001",
      idempotencyKey: "cancel-overlay",
    });
    expect(result.error).toBeNull();
    expect(rpcCancelOrder).toHaveBeenCalledTimes(1);
  });

  it("does not call the cancellation RPC for a different participant", async () => {
    fetchPersistentEngineState.mockResolvedValue(stateWithOwnedOrder("NOT_ELIGIBLE"));
    const result = await cancelSecondaryOrder({
      actor: asPersona("DEMO-TRADER-001"),
      orderId: "ORD-OPEN-STEPPE-001",
      idempotencyKey: "cancel-other",
    });
    expect(result.error).toBe("NOT_OWNER");
    expect(rpcCancelOrder).not.toHaveBeenCalled();
  });

  it("does not call the cancellation RPC for unimpersonated SYSTEM_ADMIN", async () => {
    fetchPersistentEngineState.mockResolvedValue(stateWithOwnedOrder("ELIGIBLE"));
    const actor = unimpersonatedAdmin();
    expect(actorCan(actor, "market.trade")).toBe(false);
    const result = await cancelSecondaryOrder({
      actor,
      orderId: "ORD-OPEN-STEPPE-001",
      idempotencyKey: "cancel-admin",
    });
    expect(result.error).toBe("NOT_OWNER");
    expect(rpcCancelOrder).not.toHaveBeenCalled();
  });

  it("does not call the cancellation RPC for a filled owned order", async () => {
    fetchPersistentEngineState.mockResolvedValue(
      stateWithOwnedOrder("NOT_ELIGIBLE", openSteppeOrder("FILLED")),
    );
    const result = await cancelSecondaryOrder({
      actor: asPersona("DEMO-FUND-001"),
      orderId: "ORD-OPEN-STEPPE-001",
      idempotencyKey: "cancel-filled",
    });
    expect(result.error).toBe("ORDER_NOT_CANCELABLE");
    expect(rpcCancelOrder).not.toHaveBeenCalled();
  });

  it("lets the RPC enforce ownership when the snapshot lacks the order", async () => {
    const snapshot = stateWithOwnedOrder("NOT_ELIGIBLE");
    fetchPersistentEngineState.mockResolvedValue({ ...snapshot, orders: [] });
    rpcCancelOrder.mockResolvedValue({ ok: false, error: "ORDER_NOT_FOUND" });
    const result = await cancelSecondaryOrder({
      actor: asPersona("DEMO-FUND-001"),
      orderId: "ORD-MISSING",
      idempotencyKey: "cancel-missing",
    });
    expect(rpcCancelOrder).toHaveBeenCalledWith({
      orderId: "ORD-MISSING",
      idempotencyKey: "cancel-missing",
    });
    expect(result.error).toBe("ORDER_NOT_FOUND");
  });
});
